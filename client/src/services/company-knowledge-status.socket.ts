import { io, type Socket } from 'socket.io-client'
import { refreshSession } from './api'
import type { CompanyKnowledgeStatusUpdate } from '@/types/companyKnowledge'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const socketOrigin = new URL(apiUrl, window.location.origin).origin

type Listener = {
  onStatus: (status: CompanyKnowledgeStatusUpdate) => void
  onConnected: () => void
}

let socket: Socket | null = null
let activeToken: string | null = null
const listeners = new Set<Listener>()

function disconnectSocket() {
  socket?.disconnect()
  socket = null
  activeToken = null
}

export function subscribeCompanyKnowledgeStatus(
  token: string,
  listener: Listener,
) {
  if (activeToken !== token) {
    disconnectSocket()
    activeToken = token
    const newSocket = io(socketOrigin, {
      autoConnect: false,
      withCredentials: true,
      auth: { token },
    })
    socket = newSocket
    newSocket.on('connect', () => {
      for (const current of listeners) current.onConnected()
    })
    newSocket.on('company-knowledge:status', (status: CompanyKnowledgeStatusUpdate) => {
      for (const current of listeners) current.onStatus(status)
    })
    let refreshing = false
    newSocket.on('connect_error', (error: Error) => {
      if (
        error.message !== 'Unauthorized' ||
        refreshing ||
        socket !== newSocket
      )
        return
      const currentSocket = newSocket
      refreshing = true
      currentSocket.disconnect()
      void refreshSession()
        .then((session) => {
          if (!session || socket !== currentSocket) return
          activeToken = session.accessToken
          currentSocket.auth = { token: session.accessToken }
          currentSocket.connect()
        })
        .catch(() => {
          console.error('Company Knowledge session refresh failed')
        })
        .finally(() => {
          refreshing = false
        })
    })
  }

  listeners.add(listener)
  socket?.connect()

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) disconnectSocket()
  }
}
