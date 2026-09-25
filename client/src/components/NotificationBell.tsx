import { Bell } from 'lucide-react'
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
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return null
    if (record.subtaskId && role !== 'EMPLOYEE')
      return `/work/subtasks/${record.subtaskId}`
    return record.ticketId
      ? `${role === 'EMPLOYEE' ? '/tickets' : '/work/tickets'}/${record.ticketId}`
      : null
  }
  const mark = async (record?: Notification, open = false) => {
    setBusy(true)
    setError(undefined)
    try {
      if (record) await markNotificationRead(record.id)
      else await markAllNotificationsRead()
      reload()
      const target = record && open ? destination(record) : null
      if (target) {
        setOpen(false)
        navigate(target)
      }
    } catch (failure) {
      setError(failure)
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
          <div className="button-row">
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
          {resource.loading ? (
            <LoadingState label="Loading notifications..." />
          ) : resource.error ? (
            <ErrorState error={resource.error} onRetry={refresh} />
          ) : (
            <>
              <p className="quiet-note">
                Recent 50 notifications. Links use your current access.
              </p>
              {!resource.data?.records.length && (
                <p className="muted">No notifications yet.</p>
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
        </Modal>
      )}
    </>
  )
}
