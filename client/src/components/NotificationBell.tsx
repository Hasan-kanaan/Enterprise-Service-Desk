import { toast } from 'sonner'
import { getApiErrorMessage } from '@/services/api'
import { RefreshSurface } from './RefreshSurface'
import { Bell, BellRing } from 'lucide-react'
import '@/notifications.css'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useResource } from '@/hooks/useResource'
import type { UserRole } from '@/types/auth'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationText,
  type Notification,
} from '@/services/notifications.service'
import { formatDate } from '@/types/ticketPresentation'
import { ErrorState, LoadingState } from './TicketUI'
import { Modal } from './Modal'

export function NotificationBell({ role }: { role: UserRole }) {
  const resource = useResource(getNotifications)
  const { reload } = resource
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const navigate = useNavigate()
  useEffect(() => {
    // Explicit local mutation boundary, never polling or a server push channel.
    window.addEventListener('service-desk:mutation', reload)
    return () => window.removeEventListener('service-desk:mutation', reload)
  }, [reload])
  const refresh = () => {
    setError(undefined)
    reload()
  }
  const destination = (record: Notification) => {
    if (record.ticketId && (['SUPPORT_MESSAGE', 'WAITING_FOR_EMPLOYEE', 'RESOLVED'].includes(record.type) || role === 'ADMIN' || role === 'SUPER_ADMIN')) return `/tickets/${record.ticketId}`
    if (record.subtaskId && role !== 'EMPLOYEE')
      return `/work/subtasks/${record.subtaskId}`
    return record.ticketId
      ? `/tickets/${record.ticketId}`
      : null
  }
  const mark = async (record?: Notification, open = false) => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      if (record) await markNotificationRead(record.id)
      else await markAllNotificationsRead()
      reload()
      const target = record && open ? destination(record) : null
      if (!target) toast.success(record ? 'Notification marked as read' : 'Notifications marked as read')
      if (target) {
        setOpen(false)
        navigate(target)
      }
    } catch (failure) {
      setError(failure)
      toast.error(getApiErrorMessage(failure, 'Could not update notifications.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button
        className="notification-bell"
        aria-label="Notifications"
        aria-haspopup="dialog"
        onClick={() => {
          refresh()
          setOpen(true)
        }}
      >
        <Bell size={21} aria-hidden="true" />
        {!!resource.data?.unread && (
          <span
            className="notification-badge"
            aria-label={`${resource.data.unread} unread notifications`}
          >
            {resource.data.unread > 99 ? '99+' : resource.data.unread}
          </span>
        )}
        {!!resource.error && (
          <span aria-label="Notifications unavailable">!</span>
        )}
      </button>
      {open && (
        <Modal title="Notifications" onClose={() => setOpen(false)} busy={busy}>
          <RefreshSurface busy={resource.loading && !!resource.data}><div className="button-row">
            <button
              className="button secondary"
              disabled={busy || resource.loading}
              onClick={refresh}
            >
              Refresh notifications
            </button>
            <button
              className="button secondary"
              disabled={busy || !resource.data?.unread}
              onClick={() => void mark()}
            >
              Mark all read
            </button>
          </div>
          {!!error && <ErrorState error={error} onRetry={refresh} />}
          {resource.loading && !resource.data ? (
            <LoadingState label="Loading notifications..." />
          ) : resource.error ? (
            <ErrorState error={resource.error} onRetry={refresh} />
          ) : (
            <>
              {!!resource.data?.records.length && <p className="quiet-note">Recent 50 notifications. Links use your current access.</p>}
              {!resource.data?.records.length && (
                <div className="notification-empty" role="status">
                  <span className="notification-empty-icon"><BellRing size={28} aria-hidden="true" /></span>
                  <h3>No notifications yet</h3>
                  <p>Updates about your requests and work will appear here.</p>
                </div>
              )}
              <ul className="notification-list">
                {resource.data?.records.map((record) => (
                  <li
                    key={record.id}
                    className={record.readAt ? '' : 'notification-unread'}
                  >
                    {destination(record) ? (
                      <button
                        className="notification-link"
                        disabled={busy}
                        onClick={() => void mark(record, true)}
                      >
                        {notificationText(record)}
                      </button>
                    ) : (
                      <p>{notificationText(record)}</p>
                    )}
                    <div className="notification-meta">
                      <span>{record.readAt ? 'Read' : 'Unread'}</span>
                      <time dateTime={record.createdAt}>
                        {formatDate(record.createdAt, true)}
                      </time>
                      {!record.readAt && (
                        <button
                          className="text-button"
                          disabled={busy}
                          aria-label={`Mark notification ${record.id} read`}
                          onClick={() => void mark(record)}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </RefreshSurface></Modal>
      )}
    </>
  )
}
