import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  presentation = 'modal',
}: {
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  presentation?: 'modal' | 'drawer'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const label = useId()
  useEffect(() => {
    const dialog = ref.current
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog?.showModal()
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${presentation === 'drawer' ? 'form-drawer' : ''}`}
      aria-labelledby={label}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        if (
          !busy &&
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom)
        )
          onClose()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href],button,input,select,textarea,[tabindex="0"]',
          ),
        ].filter((el) => !el.matches(':disabled') && el.getClientRects().length)
        const first = controls[0],
          last = controls.at(-1)
        if (!first) {
          event.preventDefault()
          return
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="modal-header">
        <h2 id={label}>{title}</h2>
        <button
          className="icon-button"
          disabled={busy}
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
