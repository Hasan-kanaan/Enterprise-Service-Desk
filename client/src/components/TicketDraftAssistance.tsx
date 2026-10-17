import { useEffect, useRef, useState } from 'react'
import api, { getApiStatus } from '@/services/api'
import type { TicketInput, TicketOptions } from '@/types/tickets'
import {
  assistedDraftPatch,
  draftFingerprint,
  type DraftAssistance,
} from './ticket-draft-assistance'

const moreInformation =
  'I need a little more information. Tell us what device, application, account, or service is affected and what happens when you try to use it.'

export function TicketDraftAssistance({
  draft,
  getDraft,
  options,
  onApply,
  locked,
}: {
  draft: TicketInput
  getDraft: () => TicketInput
  options: TicketOptions
  onApply: (patch: Partial<TicketInput>) => void
  locked: boolean
}) {
  const [undo, setUndo] = useState<TicketInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const negatives = useRef(new Map<string, DraftAssistance>())
  const sequence = useRef(0)
  const pending = useRef(false)
  const helperButton = useRef<HTMLButtonElement>(null)
  const latest = useRef({ getDraft, options, onApply, locked })
  useEffect(() => {
    latest.current = { getDraft, options, onApply, locked }
  }, [getDraft, options, onApply, locked])
  useEffect(
    () => () => {
      sequence.current++
    },
    [],
  )
  const meaningful = (draft.description.match(/[\p{L}\p{N}]/gu) ?? []).length
  const inputIssue =
    draft.description.length > 3000
      ? 'AI assistance supports up to 3,000 description characters. Shorten the description to use AI, or keep your text and submit manually.'
      : draft.title.length > 200
        ? 'AI assistance supports titles up to 200 characters.'
        : meaningful < 20
          ? moreInformation
          : ''

  async function analyze() {
    if (inputIssue || pending.current || locked) return
    pending.current = true
    const version = ++sequence.current
    const source = structuredClone(getDraft())
    setBusy(true)
    setError('')
    setMessage('')
    setUndo(null)
    try {
      const bytes = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(draftFingerprint(source)),
      )
      const key = Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('')
      const cached = negatives.current.get(key)
      const data =
        cached ??
        (
          await api.post<DraftAssistance>('/ticket-assistance', {
            title: source.title,
            description: source.description,
          })
        ).data
      if (sequence.current !== version) return
      if (data.scope.status !== 'IN_SCOPE') {
        if (!cached) {
          if (negatives.current.size === 8)
            negatives.current.delete(negatives.current.keys().next().value!)
          negatives.current.set(key, data)
        }
        setMessage(
          data.scope.message +
            (cached
              ? ' Reused the previous result for unchanged input. No new AI request was sent.'
              : ''),
        )
        return
      }
      const current = structuredClone(latest.current.getDraft())
      if (latest.current.locked) {
        setMessage('AI did not change the form while it was being submitted.')
        return
      }
      if (draftFingerprint(current) !== draftFingerprint(source)) {
        setMessage(
          'Your description or title changed while AI was working. No fields were updated. Ask for assistance again when ready.',
        )
        return
      }
      const patch = assistedDraftPatch(
        data,
        source,
        current,
        latest.current.options,
      )
      if (!Object.keys(patch).length) {
        setMessage(
          'AI found no confident changes to make. Your fields are unchanged; you can continue manually.',
        )
        return
      }
      // One pre-population snapshot, memory only. Manual edits keep it; a new
      // generation replaces the Undo opportunity. Attachments are separate state.
      setUndo(current)
      latest.current.onApply(patch)
      setMessage(
        'AI helped complete this ticket. Review the fields before submitting.',
      )
    } catch (failure) {
      if (sequence.current !== version) return
      const status = getApiStatus(failure)
      setError(
        status === 429
          ? 'AI generation limit reached. Please try again later, or complete this ticket manually.'
          : status === 409
            ? 'Available choices changed. Review your draft and ask for assistance again.'
            : status === 400
              ? 'Check the AI input limits. Your original text is preserved and you can continue manually.'
              : 'AI assistance is temporarily unavailable. Your draft is preserved; you can complete and submit it manually.',
      )
    } finally {
      if (sequence.current === version) {
        pending.current = false
        setBusy(false)
      }
    }
  }
  function restore() {
    if (!undo || busy || locked) return
    onApply(structuredClone(undo))
    setUndo(null)
    setMessage('AI changes undone. Your pre-AI form values have been restored.')
    helperButton.current?.focus({ preventScroll: true })
  }
  return (
    <div className="draft-assistance">
      <div className="button-row">
        <button
          ref={helperButton}
          type="button"
          className="button secondary"
          disabled={!!inputIssue || locked}
          aria-disabled={busy || !!inputIssue || locked}
          aria-describedby="draft-ai-limit"
          onClick={() => void analyze()}
        >
          Help me complete this ticket
        </button>
        {undo && (
          <button
            type="button"
            className="text-button"
            disabled={busy || locked}
            aria-describedby="draft-ai-undo"
            onClick={restore}
          >
            Undo AI changes
          </button>
        )}
      </div>
      <p className="small muted" id="draft-ai-limit">
        AI fills in this form for your review. Attachments are never sent. AI
        description limit: 20 letters or digits to 3,000 characters (
        {draft.description.length}/3,000).
      </p>
      {undo && (
        <p className="quiet-note" id="draft-ai-undo">
          Undo restores all pre-AI fields, including any edits made afterward,
          until you ask AI again.
        </p>
      )}
      <div role="status" aria-live="polite" aria-atomic="true">
        {busy ? (
          <p>Analyzing your request...</p>
        ) : (
          <>
            {message && <p>{message}</p>}
            {inputIssue && <p className="small muted">{inputIssue}</p>}
          </>
        )}
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
