import { UserRound } from 'lucide-react'

export function Avatar({ displayName }: { displayName?: string | null }) {
  const name = displayName?.trim() ?? ''
  const initial = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    .segment(name)[Symbol.iterator]().next().value?.segment
  return <span className="avatar" aria-hidden="true">{initial ? initial.toLocaleUpperCase() : <UserRound size={18} />}</span>
}
