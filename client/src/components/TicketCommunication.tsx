import { useOlderPages, uniqueById } from '@/hooks/useOlderPages'
import { AttachmentList, AttachmentPicker } from './Attachments'
import {
  type Attachment,
  postWithAttachments,
} from '@/services/attachments.service'
import { useCallback, useRef, useState } from 'react'
import api, { getApiStatus } from '@/services/api'
import { useResource } from '@/hooks/useResource'
import { ErrorState, LoadingState } from './TicketUI'
import { cycleLabel, formatDate } from '@/types/ticketPresentation'
import type { WorkCycle } from '@/types/tickets'

type Entry = {
  id: number
  createdInCycleId: number
  author: { id: number; username: string }
  content: string | null
  deletedAt: string | null
  canDelete: boolean
  attachments: Attachment[]
  createdAt: string
  editedAt: string | null
  canEdit: boolean
}
type Stream = {
  hasMore: boolean
  nextCursor: string | null
  cycles: Pick<WorkCycle, 'id' | 'sequenceNumber' | 'type' | 'isEnded'>[]
  currentCycleId: number | null
  canPost: boolean
  canReadNotes: boolean
  records: Entry[]
}

export function TicketCommunication({
  ticketId,
  cycles,
  onChanged,
}: {
  ticketId: number
  cycles: WorkCycle[]
  onChanged: () => void
}) {
  const [notesAllowed, setNotesAllowed] = useState(false)
  return (
    <>
      <CommunicationStream
        ticketId={ticketId}
        cycles={cycles}
        onChanged={onChanged}
        kind="messages"
        onAccess={setNotesAllowed}
      />
      {notesAllowed && (
        <CommunicationStream
          ticketId={ticketId}
          cycles={cycles}
          onChanged={onChanged}
          kind="internal-notes"
        />
      )}
    </>
  )
}

function CommunicationStream({
  ticketId,
  cycles,
  kind,
  onChanged,
  onAccess,
}: {
  ticketId: number
  cycles: WorkCycle[]
  kind: 'messages' | 'internal-notes'
  onChanged: () => void
  onAccess?: (allowed: boolean) => void
}) {
  const path = `/tickets/${ticketId}/${kind}`
  const resource = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        try {
          const result = (await api.get<Stream>(path, { signal })).data
          if (!signal.aborted) onAccess?.(result.canReadNotes)
          return result
        } catch (failure) {
          if (
            !signal.aborted &&
            [401, 403, 404].includes(getApiStatus(failure) ?? 0)
          )
            onAccess?.(false)
          throw failure
        }
      },
      [path, onAccess],
    ),
  )
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [draftCycle, setDraftCycle] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const request = useRef<{
    content: string
    cycle: number
    key: string
    files: File[]
  } | null>(null)
  const notes = kind === 'internal-notes'
  const title = notes ? 'Internal notes — support only' : 'Conversation'
  const pages = useOlderPages(resource.data, (current, older) => ({
    ...older,
    records: uniqueById([...older.records, ...current.records])
      .map((record) => ({
        ...record,
        canEdit:
          record.canEdit &&
          older.canPost &&
          record.createdInCycleId === older.currentCycleId,
        canDelete:
          record.canDelete &&
          older.canPost &&
          record.createdInCycleId === older.currentCycleId,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id),
    cycles: uniqueById([...current.cycles, ...older.cycles]).sort(
      (a, b) => b.sequenceNumber - a.sequenceNumber,
    ),
  }))
  const data = pages.data
  const integrate = (entry: Entry) =>
    pages.update((current) => ({
      ...current,
      records: uniqueById([
        ...current.records,
        {
          ...entry,
          canEdit:
            !entry.deletedAt &&
            current.canPost &&
            entry.createdInCycleId === current.currentCycleId,
          canDelete:
            !entry.deletedAt &&
            current.canPost &&
            entry.createdInCycleId === current.currentCycleId,
        },
      ]).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id),
    }))
  const loadOlder = () =>
    pages.load(
      async () =>
        (await api.get<Stream>(path, { params: { cursor: data?.nextCursor } }))
          .data,
    )
  const stale =
    !!data && draftCycle !== null && draftCycle !== data.currentCycleId
  const conflict = getApiStatus(error) === 409
  const reload = () => {
    setError(undefined)
    resource.reload()
  }
  const submit = async () => {
    const content = draft.trim()
    const cycle = draftCycle ?? data?.currentCycleId
    if (!content || !cycle || stale || conflict) return
    setBusy(true)
    setError(undefined)
    try {
      let saved: Entry
      if (editing !== null) {
        saved = (
          await api.patch<Entry>(`${path}/${editing}`, {
            content,
            expectedCycleId: cycle,
          })
        ).data
      } else {
        if (
          !request.current ||
          request.current.content !== content ||
          request.current.cycle !== cycle ||
          request.current.files !== files
        )
          request.current = { content, cycle, key: crypto.randomUUID(), files }
        saved = (
          await postWithAttachments<Entry>(
            path,
            {
              content,
              expectedCycleId: cycle,
              clientRequestId: request.current.key,
            },
            files,
          )
        ).data
      }
      setDraft('')
      setFiles([])
      setDraftCycle(null)
      setEditing(null)
      request.current = null
      integrate(saved)
      // Only a new requester message can change ticket status. Other writes
      // update loaded records without discarding a draft in the sibling stream.
      if (!notes && !data?.canReadNotes && editing === null) onChanged()
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (record: Entry, file?: Attachment) => {
    if (
      !file &&
      !window.confirm(
        `Delete this ${notes ? 'note' : 'message'} and its attachments?`,
      )
    )
      return
    setBusy(true)
    setError(undefined)
    try {
      const removed = await api.delete<Entry | Attachment>(
        `${path}/${record.id}${file ? `/attachments/${file.id}` : ''}`,
        { data: { expectedCycleId: data?.currentCycleId } },
      )
      if (editing === record.id && !file) {
        setEditing(null)
        setDraft('')
        setDraftCycle(null)
      }
      if (file)
        pages.update((current) => ({
          ...current,
          records: current.records.map((item) =>
            item.id === record.id
              ? {
                  ...item,
                  attachments: item.attachments.map((attachment) =>
                    attachment.id === file.id
                      ? (removed.data as Attachment)
                      : attachment,
                  ),
                }
              : item,
          ),
        }))
      else integrate(removed.data as Entry)
    } catch (failure) {
      setError(failure)
      if (file) throw failure
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <section className="panel communication" aria-label={title}>
        <div className="list-heading">
          <h2>{title}</h2>
          <button
            className="text-button"
            disabled={busy || resource.loading}
            onClick={reload}
          >
            Refresh {notes ? 'notes' : 'conversation'}
          </button>
        </div>
        <p className="muted">
          {notes
            ? 'Visible only to currently authorized support. Never shared with the requester.'
            : 'Messages here are visible to the requester and currently authorized support.'}
        </p>
        {resource.loading ? (
          <LoadingState label={`Loading ${title.toLowerCase()}...`} />
        ) : resource.error ? (
          <ErrorState error={resource.error} onRetry={reload} />
        ) : (
          data && (
            <>
              {data.hasMore ? (
                <>
                  <button
                    className="button secondary"
                    disabled={pages.loading || busy}
                    onClick={() => void loadOlder()}
                  >
                    {pages.loading
                      ? 'Loading older...'
                      : `Load older ${notes ? 'notes' : 'messages'}`}
                  </button>
                  <p className="muted small">
                    Showing loaded records; the oldest cycle may be incomplete.
                  </p>
                </>
              ) : (
                <p className="muted small">
                  Beginning of {notes ? 'notes' : 'conversation'}.
                </p>
              )}
              {!!pages.error && (
                <ErrorState
                  error={pages.error}
                  onRetry={() => void loadOlder()}
                />
              )}
              {data.records.length === 0 && (
                <p className="muted">
                  No {notes ? 'internal notes' : 'messages'} yet.
                </p>
              )}
              {(data.cycles ?? cycles).map((cycle) => {
                const records = data.records.filter(
                  (record) => record.createdInCycleId === cycle.id,
                )
                if (!records.length) return null
                return (
                  <div key={cycle.id} className="communication-cycle">
                    <h3>
                      {cycleLabel(cycle)}
                      {cycle.isEnded ? ' — read-only' : ''}
                    </h3>
                    <ol className="communication-records">
                      {records.map((record) => (
                        <li key={record.id}>
                          <p className="small">
                            <strong>{record.author.username}</strong> ·{' '}
                            {formatDate(record.createdAt, true)}
                            {record.editedAt && (
                              <span title={formatDate(record.editedAt, true)}>
                                {' '}
                                · edited
                              </span>
                            )}
                          </p>
                          {record.deletedAt ? (
                            <p className="muted">
                              {notes ? 'Note' : 'Message'} deleted &#183;{' '}
                              {formatDate(record.deletedAt, true)}
                            </p>
                          ) : (
                            <p className="description">{record.content}</p>
                          )}
                          <AttachmentList
                            files={record.attachments ?? []}
                            disabled={busy}
                            onDelete={
                              record.canDelete && !conflict
                                ? (file) => remove(record, file)
                                : undefined
                            }
                          />
                          {record.canDelete && (
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy || conflict}
                              onClick={() => void remove(record)}
                            >
                              Delete {notes ? 'note' : 'message'}
                            </button>
                          )}
                          {record.canEdit && (
                            <button
                              className="text-button"
                              disabled={
                                busy ||
                                !!draft ||
                                files.length > 0 ||
                                editing !== null
                              }
                              onClick={() => {
                                setEditing(record.id)
                                setDraft(record.content ?? '')
                                setDraftCycle(record.createdInCycleId)
                                setError(undefined)
                              }}
                            >
                              Edit {notes ? 'note' : 'message'}
                            </button>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )
              })}
              {!data.canPost && (
                <p className="notice">
                  Posting is unavailable with your current relationship or this
                  ticket's lifecycle state.
                </p>
              )}
              {!!error && <ErrorState error={error} onRetry={reload} />}
              {(data.canPost || draft || files.length > 0) && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void submit()
                  }}
                >
                  <label className="field">
                    {editing !== null ? 'Edit your' : 'New'}{' '}
                    {notes ? 'internal note' : 'message'}
                    <textarea
                      aria-label={
                        notes ? 'Internal note content' : 'Message content'
                      }
                      maxLength={4000}
                      rows={4}
                      value={draft}
                      disabled={busy}
                      onChange={(event) => {
                        setDraft(event.target.value)
                        if (draftCycle === null)
                          setDraftCycle(data.currentCycleId)
                      }}
                    />
                  </label>
                  <p className="small muted">
                    {draft.length}/4000 characters. Plain text.
                  </p>
                  {editing === null && (
                    <AttachmentPicker
                      files={files}
                      disabled={busy}
                      onChange={(next) => {
                        setFiles(next)
                        if (draftCycle === null)
                          setDraftCycle(data.currentCycleId)
                      }}
                    />
                  )}
                  {stale && (
                    <p className="notice">
                      This draft belongs to an earlier cycle. Review it before
                      starting a new message in the current cycle.
                    </p>
                  )}
                  <div className="button-row">
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        !data.canPost ||
                        stale ||
                        conflict ||
                        !draft.trim()
                      }
                    >
                      {busy
                        ? 'Saving...'
                        : editing !== null
                          ? 'Save edit'
                          : notes
                            ? 'Add internal note'
                            : 'Send message'}
                    </button>
                    {stale && data.canPost && (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={() => {
                          setEditing(null)
                          setDraftCycle(data.currentCycleId)
                          request.current = null
                        }}
                      >
                        Use reviewed text as new {notes ? 'note' : 'message'}
                      </button>
                    )}
                    {(draft || files.length > 0 || editing !== null) && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          setDraft('')
                          setFiles([])
                          setDraftCycle(null)
                          setEditing(null)
                          setError(undefined)
                          request.current = null
                        }}
                      >
                        Discard draft
                      </button>
                    )}
                  </div>
                </form>
              )}
            </>
          )
        )}
      </section>
    </>
  )
}
