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
  return (
    <>
      <button
        type="button"
        className="button secondary action-menu-trigger"
        popoverTarget={id}
        aria-label={label}
        onClick={(event) => {
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
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button:not(:disabled), a'))
            popover.current?.hidePopover()
        }}
      >
        {children}
      </div>
    </>
  )
}
