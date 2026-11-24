import axios, { type AxiosResponse } from 'axios'
import api from './api'

export type Attachment = {
  id: number
  filename: string | null
  contentType: string | null
  byteSize: number | null
  createdAt: string
  deletedAt: string | null
}
type AttachmentBytesEntry = {
  promise: Promise<Blob>
  controller: AbortController
  references: number
  settled: boolean
  cleanupTimer?: ReturnType<typeof setTimeout>
}
const attachmentBytesCache = new Map<number, AttachmentBytesEntry>()
const ATTACHMENT_MIN_TIMEOUT_MS = 60_000
const ATTACHMENT_MIN_TRANSFER_RATE = 64 * 1024
const ATTACHMENT_TIMEOUT_OVERHEAD_MS = 30_000

export async function postWithAttachments<T>(
  path: string,
  payload: object,
  files: File[],
) {
  if (!files.length) return api.post<T>(path, payload)
  const form = new FormData()
  form.append('payload', JSON.stringify(payload))
  files.forEach((file) => form.append('files', file))
  // Override the shared JSON default. Axios otherwise serializes FormData as
  // JSON; with this media type it leaves the boundary to the browser.
  return api.post<T>(path, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

function attachmentTimeoutMs(byteSize: number | null) {
  const estimatedTransferMs =
    ((byteSize ?? 0) / ATTACHMENT_MIN_TRANSFER_RATE) * 1000
  return Math.max(
    ATTACHMENT_MIN_TIMEOUT_MS,
    Math.ceil(estimatedTransferMs + ATTACHMENT_TIMEOUT_OVERHEAD_MS),
  )
}

async function fetchAttachmentBytes(
  file: Pick<Attachment, 'id' | 'contentType' | 'byteSize'>,
  signal: AbortSignal,
) {
  let response: AxiosResponse<Blob>
  try {
    response = await api.get<Blob>(
      `/tickets/attachments/${file.id}/download`,
      {
        responseType: 'blob',
        signal,
        timeout: attachmentTimeoutMs(file.byteSize),
      },
    )
  } catch (failure) {
    if (
      axios.isAxiosError(failure) &&
      failure.code === 'ECONNABORTED'
    )
      throw new Error(
        'Attachment transfer timed out. Check your connection and retry.',
        { cause: failure },
      )
    if (
      axios.isAxiosError(failure) &&
      !failure.response &&
      ['ERR_NETWORK', 'ECONNRESET', 'ETIMEDOUT'].includes(failure.code ?? '')
    )
      throw new Error(
        'The server connection was interrupted while retrieving this attachment. Check that the server is running, then retry.',
        { cause: failure },
      )
    if (axios.isAxiosError(failure) && failure.response?.data instanceof Blob) {
      const bodyText = await failure.response.data.text()
      let payload: unknown
      try {
        payload = JSON.parse(bodyText)
      } catch {
        payload = undefined
      }
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'message' in payload &&
        typeof payload.message === 'string'
      )
        throw new Error(payload.message, { cause: failure })
      if (failure.response.status === 404)
        throw new Error(
          'Attachment is unavailable or you no longer have access.',
          { cause: failure },
        )
      if (failure.response.status >= 500)
        throw new Error('Attachment storage is unavailable. Try again shortly.', {
          cause: failure,
        })
    }
    throw failure
  }
  if (response.data.type.split(';', 1)[0].trim().toLowerCase() !== file.contentType) throw new Error('Attachment type could not be verified.')
  return response.data
}

export function attachmentBytes(
  file: Pick<Attachment, 'id' | 'contentType' | 'byteSize'>,
) {
  let entry = attachmentBytesCache.get(file.id)
  if (entry?.cleanupTimer) {
    clearTimeout(entry.cleanupTimer)
    entry.cleanupTimer = undefined
  }
  if (!entry) {
    const controller = new AbortController()
    let created: AttachmentBytesEntry | null = null
    const promise = fetchAttachmentBytes(file, controller.signal).then(
      (blob) => {
        if (created) created.settled = true
        return blob
      },
      (error: unknown) => {
        if (created) created.settled = true
        if (created && attachmentBytesCache.get(file.id) === created)
          attachmentBytesCache.delete(file.id)
        throw error
      },
    )
    created = {
      controller,
      references: 0,
      settled: false,
      promise,
    }
    entry = created
    attachmentBytesCache.set(file.id, entry)
  }
  entry.references++
  return entry.promise
}

export function releaseAttachmentBytes(id: number) {
  const entry = attachmentBytesCache.get(id)
  if (!entry) return
  entry.references = Math.max(0, entry.references - 1)
  if (entry.references !== 0 || entry.cleanupTimer) return
  entry.cleanupTimer = setTimeout(() => {
    if (entry.references !== 0) return
    if (attachmentBytesCache.get(id) === entry) attachmentBytesCache.delete(id)
    if (!entry.settled) entry.controller.abort()
  }, 0)
}

export async function downloadAttachment(file: Attachment) {
  const bytes = attachmentBytes(file)
  try {
    const url = URL.createObjectURL(await bytes)
    const link = document.createElement('a')
    link.href = url
    link.download = file.filename ?? 'download'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } finally {
    releaseAttachmentBytes(file.id)
  }
}
