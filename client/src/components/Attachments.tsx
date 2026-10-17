import { AttachmentCard } from './AttachmentCard'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/services/api'
import { useCallback, useId, useState } from 'react'
import api from '@/services/api'
import {
  type Attachment,
  downloadAttachment,
} from '@/services/attachments.service'
import { useResource } from '@/hooks/useResource'
import { ErrorState, LoadingState } from './TicketUI'
import { formatDate } from '@/types/ticketPresentation'

const accept = '.png,.jpg,.jpeg,.webp,.pdf,.txt,.log,.json,.csv,.mp4,.webm'
const contentTypes: Record<string, string[]> = {
  mp4: ['video/mp4'],
  webm: ['video/webm'],
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
  const pickerId = useId()
  const [error, setError] = useState('')
  return (
    <div className="attachment-picker">
      <p id={`${pickerId}-label`} className="field">Attachments (optional)</p>
      <div className="file-picker-row">
      <label className="button secondary file-picker-control">
        Choose files
        <input
          className="file-picker-input"
          aria-labelledby={`${pickerId}-label`}
          aria-describedby={`${pickerId}-status`}
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
            if (next.some((file) => file.size > (/\.(mp4|webm)$/i.test(file.name) ? 25 : 10) * 1024 * 1024)) {
              setError('Each file must be at most 10 MiB, or 25 MiB for video.')
              return
            }
            if (next.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) {
              setError('Attachments must total at most 50 MiB.')
              return
            }
            if (
              next.some((file) => {
                const types =
                  contentTypes[file.name.split('.').pop()?.toLowerCase() ?? '']
                return (
                  !types ||
                  (/\.(mp4|webm)$/i.test(file.name) && !types.includes(file.type)) ||
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
      <span id={`${pickerId}-status`} role="status">{files.length === 0 ? 'No files selected' : `${files.length} ${files.length === 1 ? 'file' : 'files'} selected`}</span>
      </div>
      <p className="small muted">
        Up to 5 files, 50 MiB total. Images/documents: 10 MiB each; MP4/WebM video: 25 MiB each. PNG, JPEG, WebP, PDF, TXT, LOG, JSON, CSV, MP4 or WebM.
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
              aria-label={`Remove ${file.name}`}
              onClick={() => {
                onChange(files.filter((_, i) => i !== index))
                setError('')
              }}
            >
              Remove
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
  const action = async (run: () => Promise<void>, removing = false) => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      await run()
      if (removing) toast.success('Attachment deleted')
    } catch (failure) {
      setError(failure)
      toast.error(getApiErrorMessage(failure, 'Could not complete the attachment action.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {!!error && <ErrorState error={error} />}
      <ul className="attachment-cards">
        {files.map((file) => (
          <li key={file.id}>
            {file.deletedAt ? (
              <span>
                Attachment deleted · {formatDate(file.deletedAt, true)}
              </span>
            ) : (
              <AttachmentCard file={file} disabled={disabled || busy}
                onDownload={() => void action(() => downloadAttachment(file))}
                onDelete={onDelete ? () => {
                  if (window.confirm('Delete this attachment? It will no longer be downloadable.')) void action(() => onDelete(file), true)
                } : undefined}
              />
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
export function TicketAttachments({ ticketId, refreshKey = 0 }: { ticketId: number; refreshKey?: number }) {
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
    refreshKey,
  )
  return (
    <section
      className="panel detail-body"
      aria-label="Original request attachments"
    >
      <h2>Original request attachments</h2>
      <p className="small muted">Files submitted with this request.</p>
      {resource.loading && !resource.data ? (
        <LoadingState label="Loading attachments..." />
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
