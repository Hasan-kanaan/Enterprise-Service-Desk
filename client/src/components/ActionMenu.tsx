import { useId, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'

/** Native popover provides Escape, light-dismiss and keyboard focus return. */
export function ActionMenu({
  label = 'Actions',
  children,
}: {
  label?: string
  children: ReactNode
}) {
  const id = useId()
  const popover = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="button secondary action-menu-trigger"
        aria-label={label}
        aria-controls={id}
        aria-expanded={open}
        onClick={(event) => {
          const menu = popover.current
          if (!menu) return
          if (menu.matches(':popover-open')) {
            menu.hidePopover()
            return
          }
          const rect = event.currentTarget.getBoundingClientRect()
          setPosition({
            top: Math.max(
              8,
              Math.min(rect.bottom + 4, window.innerHeight - 300),
            ),
            left: Math.max(
              8,
              Math.min(rect.right - 220, window.innerWidth - 228),
            ),
          })
          menu.showPopover()
          window.requestAnimationFrame(() => {
            if (popover.current?.matches(':popover-open'))
              popover.current
                .querySelector<HTMLElement>('button:not(:disabled), a[href]')
                ?.focus()
          })
        }}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
        <span>Actions</span>
      </button>
      <div
        id={id}
        ref={popover}
        popover="auto"
        role="group"
        className="action-menu"
        style={position}
        aria-label={label}
        onToggle={(event) => setOpen(event.currentTarget.matches(':popover-open'))}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button:not(:disabled), a')) {
            popover.current?.hidePopover()
            // A form may open from this menu. Restore to its visible trigger,
            // rather than leaving the dialog to remember a hidden menu item.
            const trigger = popover.current?.previousElementSibling
            if (trigger instanceof HTMLElement) trigger.focus()
          }
        }}
      >
        {children}
      </div>
    </>
  )
}
