import { useEffect, useState } from 'react'
import { FileImage, FileText, Film, File, Download } from 'lucide-react'
import {
  attachmentBytes,
  releaseAttachmentBytes,
  type Attachment,
} from '@/services/attachments.service'
import { ErrorState } from './TicketUI'

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`
}

const fileKinds: Record<string, string> = {
  'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP',
  'video/mp4': 'MP4', 'video/webm': 'WebM', 'application/pdf': 'PDF',
  'text/plain': 'Text', 'application/json': 'JSON', 'text/csv': 'CSV',
  'application/vnd.ms-excel': 'CSV',
}

function PrivatePreview({ file }: { file: Attachment }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<unknown>()
  const [attempt, setAttempt] = useState(0)
  const [mediaFailed, setMediaFailed] = useState(false)
  const { id, contentType, byteSize } = file
  useEffect(() => {
    let objectUrl = ''
    let active = true
    attachmentBytes({ id, contentType, byteSize }).then(blob => {
      if (!active) return
      if (blob.size !== byteSize) throw new Error('Attachment size could not be verified.')
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch((failure: unknown) => { if (active) setError(failure) })
    return () => {
      active = false
      releaseAttachmentBytes(id)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id, contentType, byteSize, attempt])
  if (error) return <ErrorState error={error} message={error instanceof Error ? error.message : undefined} onRetry={() => { setError(undefined); setAttempt(value => value + 1) }} />
  if (!url) return <p className="quiet-note" role="status">Loading private preview…</p>
  if (mediaFailed) return <p className="quiet-note" role="status">This browser could not display the preview. Download the file to view it.</p>
  return contentType?.startsWith('video/')
    ? <video className="attachment-preview" src={url} controls preload="metadata" onError={() => setMediaFailed(true)} aria-label={`Video preview: ${file.filename}`} />
    : <img className="attachment-preview" src={url} onError={() => setMediaFailed(true)} alt={`Preview of ${file.filename}`} />
}

export function AttachmentCard({ file, disabled, downloading, onDownload, onDelete }: {
  file: Attachment
  disabled: boolean
  downloading?: boolean
  onDownload: () => void
  onDelete?: () => void
}) {
  const image = ['image/png', 'image/jpeg', 'image/webp'].includes(file.contentType ?? '')
  const video = ['video/mp4', 'video/webm'].includes(file.contentType ?? '')
  const Icon = image ? FileImage : video ? Film : file.contentType?.includes('text') || file.contentType === 'application/json' || file.contentType === 'application/pdf' ? FileText : File
  return <article className="attachment-card" aria-label={`Attachment: ${file.filename}`}>
    <div className="attachment-card-info">
      <Icon size={24} aria-hidden="true" />
      <div><p className="attachment-filename" title={file.filename ?? undefined}>{file.filename}</p><p className="quiet-note">{fileKinds[file.contentType ?? ''] ?? 'File'} · {fileSize(file.byteSize ?? 0)}</p></div>
    </div>
    <div className="attachment-card-actions">
      <button type="button" className="text-button" disabled={disabled} onClick={onDownload} aria-label={`Download ${file.filename}`}><Download size={15} aria-hidden="true" /> {downloading ? 'Downloading…' : 'Download'}</button>
      {onDelete && <button type="button" className="text-button" disabled={disabled} onClick={onDelete} aria-label={`Delete attachment ${file.filename}`}>Delete attachment</button>}
    </div>
    {(image || video) && <PrivatePreview file={file} />}
  </article>
}
