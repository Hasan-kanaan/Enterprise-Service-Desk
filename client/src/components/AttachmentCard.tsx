import { useEffect, useState } from 'react'
import { FileImage, FileText, Film, File, Download } from 'lucide-react'
import { attachmentBytes, type Attachment } from '@/services/attachments.service'
import { ErrorState } from './TicketUI'

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`
}

function PrivatePreview({ file }: { file: Attachment }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<unknown>()
  const [attempt, setAttempt] = useState(0)
  const [mediaFailed, setMediaFailed] = useState(false)
  const { id, contentType, byteSize } = file
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    attachmentBytes({ id, contentType }, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      if (blob.size !== byteSize) throw new Error('Attachment size could not be verified.')
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id, contentType, byteSize, attempt])
  if (error) return <ErrorState error={error} onRetry={() => { setError(undefined); setAttempt(value => value + 1) }} />
  if (!url) return <p className="quiet-note" role="status">Loading private preview…</p>
  if (mediaFailed) return <p className="quiet-note" role="status">This browser could not display the preview. Download the file to view it.</p>
  return contentType?.startsWith('video/')
    ? <video className="attachment-preview" src={url} controls preload="metadata" onError={() => setMediaFailed(true)} aria-label={`Video preview: ${file.filename}`} />
    : <img className="attachment-preview" src={url} onError={() => setMediaFailed(true)} alt={`Preview of ${file.filename}`} />
}

export function AttachmentCard({ file, disabled, onDownload, onDelete }: {
  file: Attachment
  disabled: boolean
  onDownload: () => void
  onDelete?: () => void
}) {
  const [preview, setPreview] = useState(false)
  const image = ['image/png', 'image/jpeg', 'image/webp'].includes(file.contentType ?? '')
  const video = ['video/mp4', 'video/webm'].includes(file.contentType ?? '')
  const Icon = image ? FileImage : video ? Film : file.contentType?.includes('text') || file.contentType === 'application/json' || file.contentType === 'application/pdf' ? FileText : File
  useEffect(() => {
    // Clear private bytes when leaving/resuming the page; showing again reauthorizes.
    const clear = () => setPreview(false)
    window.addEventListener('pagehide', clear)
    window.addEventListener('focus', clear)
    return () => { window.removeEventListener('pagehide', clear); window.removeEventListener('focus', clear) }
  }, [])
  return <article className="attachment-card" aria-label={`Attachment: ${file.filename}`}>
    <div className="attachment-card-info">
      <Icon size={24} aria-hidden="true" />
      <div><p className="attachment-filename">{file.filename}</p><p className="quiet-note">{file.contentType?.split('/')[1]?.toUpperCase()} · {fileSize(file.byteSize ?? 0)}</p></div>
    </div>
    <div className="attachment-card-actions">
      {(image || video) && <button type="button" className="text-button" disabled={disabled} aria-expanded={preview} aria-label={`${preview ? 'Hide' : 'Preview'} ${file.filename}`} onClick={() => setPreview(value => !value)}>{preview ? 'Hide preview' : video ? 'Preview video' : 'Preview image'}</button>}
      <button type="button" className="text-button" disabled={disabled} onClick={onDownload} aria-label={`Download ${file.filename}`}><Download size={15} aria-hidden="true" /> Download</button>
      {onDelete && <button type="button" className="text-button" disabled={disabled} onClick={onDelete} aria-label={`Delete attachment ${file.filename}`}>Delete attachment</button>}
    </div>
    {preview && <PrivatePreview file={file} />}
  </article>
}
