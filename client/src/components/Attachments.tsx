import { useCallback, useState } from 'react'
import api from '@/services/api'
import {
  type Attachment,
  downloadAttachment,
} from '@/services/attachments.service'
import { useResource } from '@/hooks/useResource'
import { ErrorState, LoadingState } from './TicketUI'
import { formatDate } from '@/types/ticketPresentation'

const accept = '.png,.jpg,.jpeg,.webp,.pdf,.txt,.log,.json,.csv'
const contentTypes: Record<string, string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
  txt: ['text/plain'],
  log: ['text/plain'],
  json: ['application/json'],
  csv: ['text/csv', 'application/vnd.ms-excel'],
}
export function AttachmentPicker({
  files,
  onChange,
  disabled = false,
}: {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}) {
  const [error, setError] = useState('')
  return (
    <div className="attachment-picker">
      <label className="field">
        Attachments (optional)
        <input
          type="file"
          multiple
          accept={accept}
          disabled={disabled}
          onChange={(event) => {
            const next = [...files, ...Array.from(event.target.files ?? [])]
            event.target.value = ''
            if (next.length > 5) {
              setError('Choose at most 5 files.')
              return
            }
            if (next.some((file) => file.size > 10 * 1024 * 1024)) {
              setError('Each file must be at most 10 MB.')
              return
            }
            if (
              next.some((file) => {
                const types =
                  contentTypes[file.name.split('.').pop()?.toLowerCase() ?? '']
                return (
                  !types ||
                  (file.type &&
                    file.type !== 'application/octet-stream' &&
                    !types.includes(file.type))
                )
              })
            ) {
              setError('Unsupported file type.')
              return
            }
            setError('')
            onChange(next)
          }}
        />
      </label>
      <p className="small muted">
        Up to 5 files, 10 MB each. PNG, JPEG, WebP, PDF, TXT, LOG, JSON or CSV.
      </p>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <ul className="attachment-list">
        {files.map((file, index) => (
          <li key={index}>
            <span>
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </span>
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => {
                onChange(files.filter((_, i) => i !== index))
                setError('')
              }}
            >
              Remove {file.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
export function AttachmentList({
  files,
  onDelete,
  disabled = false,
}: {
  files: Attachment[]
  onDelete?: (file: Attachment) => Promise<void>
  disabled?: boolean
}) {
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const action = async (run: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await run()
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {!!error && <ErrorState error={error} />}
      <ul className="attachment-list">
        {files.map((file) => (
          <li key={file.id}>
            {file.deletedAt ? (
              <span>
                Attachment deleted · {formatDate(file.deletedAt, true)}
              </span>
            ) : (
              <>
                <span>
                  {file.filename} · {((file.byteSize ?? 0) / 1024).toFixed(1)}{' '}
                  KB
                </span>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled || busy}
                  onClick={() => void action(() => downloadAttachment(file))}
                >
                  Download {file.filename}
                </button>
                {onDelete && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={disabled || busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Delete this attachment? It will no longer be downloadable.',
                        )
                      )
                        void action(() => onDelete(file))
                    }}
                  >
                    Delete attachment
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
export function TicketAttachments({ ticketId }: { ticketId: number }) {
  const resource = useResource(
    useCallback(
      async (signal: AbortSignal) =>
        (
          await api.get<Attachment[]>(`/tickets/${ticketId}/attachments`, {
            signal,
          })
        ).data,
      [ticketId],
    ),
  )
  return (
    <section className="panel" aria-label="Original request attachments">
      <h2>Original request attachments</h2>
      <p className="small muted">
        Files submitted with the original request are permanent and cannot be
        changed.
      </p>
      {resource.loading ? (
        <LoadingState />
      ) : resource.error ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : resource.data?.length ? (
        <AttachmentList files={resource.data} />
      ) : (
        <p className="muted">No attachments.</p>
      )}
    </section>
  )
}
