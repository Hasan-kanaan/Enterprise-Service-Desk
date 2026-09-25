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
  content: string
  createdAt: string
  editedAt: string | null
  canEdit: boolean
}
type Stream = {
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
  const [draftCycle, setDraftCycle] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const request = useRef<{
    content: string
    cycle: number
    key: string
  } | null>(null)
  const notes = kind === 'internal-notes'
  const title = notes ? 'Internal notes — support only' : 'Conversation'
  const data = resource.data
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
      if (editing !== null) {
        await api.patch(`${path}/${editing}`, {
          content,
          expectedCycleId: cycle,
        })
      } else {
        if (
          !request.current ||
          request.current.content !== content ||
          request.current.cycle !== cycle
        )
          request.current = { content, cycle, key: crypto.randomUUID() }
        await api.post(path, {
          content,
          expectedCycleId: cycle,
          clientRequestId: request.current.key,
        })
      }
      setDraft('')
      setDraftCycle(null)
      setEditing(null)
      request.current = null
      reload()
      // Only a new requester message can change ticket status. Other writes
      // refresh their stream without discarding a draft in the sibling stream.
      if (!notes && !data?.canReadNotes && editing === null) onChanged()
    } catch (failure) {
      setError(failure)
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
                          <p className="description">{record.content}</p>
                          {record.canEdit && (
                            <button
                              className="text-button"
                              disabled={busy || !!draft || editing !== null}
                              onClick={() => {
                                setEditing(record.id)
                                setDraft(record.content)
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
              {(data.canPost || draft) && (
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
                  {!!error && <ErrorState error={error} onRetry={reload} />}
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
                    {(draft || editing !== null) && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          setDraft('')
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
