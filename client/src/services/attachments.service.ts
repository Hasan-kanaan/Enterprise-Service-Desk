import api from './api'

export type Attachment = {
  id: number
  filename: string | null
  contentType: string | null
  byteSize: number | null
  createdAt: string
  deletedAt: string | null
}
export async function postWithAttachments<T>(
  path: string,
  payload: object,
  files: File[],
) {
  if (!files.length) return api.post<T>(path, payload)
  const form = new FormData()
  form.append('payload', JSON.stringify(payload))
  files.forEach((file) => form.append('files', file))
  return api.post<T>(path, form, { headers: { 'Content-Type': undefined } })
}
export async function downloadAttachment(file: Attachment) {
  const response = await api.get<Blob>(
    `/tickets/attachments/${file.id}/download`,
    { responseType: 'blob' },
  )
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename ?? 'download'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
