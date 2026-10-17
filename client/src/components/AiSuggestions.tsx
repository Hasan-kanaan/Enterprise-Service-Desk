import { useState } from 'react'
import api, { getApiStatus } from '@/services/api'
import { updateTicket } from '@/services/tickets.service'
import { assignTicket } from '@/services/operations.service'
import type { TicketDetail, TicketPriority } from '@/types/tickets'
import type { TicketOperations } from '@/types/operations'

type Evidence = { confidence: number; reason: string }
type Choice = Evidence & { id: number | null; name: string | null }
type Recommendation = {
  ticketUpdatedAt: string
  generatedAt: string
  suggestions: {
    category: Choice
    priority: Evidence & { value: TicketPriority | null }
    tags: Choice[]
    team: Choice
    agent: Choice
  }
}

export function AiSuggestions({
  ticket,
  permissions,
  onChanged,
}: {
  ticket: TicketDetail
  permissions: TicketOperations['permissions']
  onChanged: () => void
}) {
  const [result, setResult] = useState<Recommendation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const stale = !!result && result.ticketUpdatedAt !== ticket.updatedAt
  async function generate() {
    setBusy(true)
    setResult(null)
    setError('')
    setConflict(false)
    try {
      setResult(
        (await api.post<Recommendation>(`/tickets/${ticket.id}/ai-suggestions`))
          .data,
      )
    } catch (failure) {
      const status = getApiStatus(failure)
      setConflict(status === 409)
      setError(
        status === 429
          ? 'AI generation limit reached. Please try again later.'
          : status === 409
            ? 'Ticket or eligible choices changed. Reload and regenerate AI suggestions.'
            : 'AI suggestions are temporarily unavailable. You can continue working on this ticket.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function apply(action: () => Promise<unknown>) {
    if (!result || stale || busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      setResult(null)
      onChanged()
    } catch (failure) {
      setConflict([400, 403, 404, 409].includes(getApiStatus(failure) ?? 0))
      setError(
        'The suggestion could not be applied. Ticket or eligible choices may have changed. Reload and regenerate suggestions.',
      )
    } finally {
      setBusy(false)
    }
  }
  const s = result?.suggestions
  const expectedUpdatedAt = result?.ticketUpdatedAt
  function row(
    label: string,
    current: string,
    suggested: string | null,
    evidence: Evidence,
    allowed: boolean,
    action: () => Promise<unknown>,
    buttonLabel = `Apply ${label.toLowerCase()}`,
  ) {
    const weak = evidence.confidence < 0.55
    return (
      <div className="ai-suggestion" key={label}>
        <h3>{label}</h3>
        <p className="muted">Current: {current}</p>
        <p>Suggested: {suggested ?? 'Insufficient evidence'}</p>
        <p className="quiet-note">
          AI confidence: {Math.round(evidence.confidence * 100)}%
          {weak ? ' · Low confidence — review manually' : ''}
        </p>
        {evidence.reason && <p>{evidence.reason}</p>}
        {suggested && (
          <button
            className="button secondary"
            disabled={busy || stale || conflict || weak || !allowed}
            onClick={() => void apply(action)}
          >
            {buttonLabel}
          </button>
        )}
      </div>
    )
  }
  return (
    <section
      className="panel detail-body ai-suggestions"
      aria-labelledby="ai-suggestions-title"
      aria-busy={busy}
    >
      <h2 id="ai-suggestions-title">AI suggestions</h2>
      <p className="quiet-note">
        AI-generated suggestion — review before applying.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void generate()}
      >
        {busy
          ? 'Please wait…'
          : result
            ? 'Regenerate AI suggestions'
            : 'Generate AI suggestions'}
      </button>
      {!permissions.edit && (
        <p className="quiet-note">
          Existing ticket permissions still apply. Take responsibility from
          intake before editing or routing.
        </p>
      )}
      {!!error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {stale && (
        <p className="notice" role="alert">
          Ticket changed. Reload and regenerate AI suggestions.
        </p>
      )}
      {(stale || conflict) && (
        <button
          className="text-button"
          onClick={() => {
            setResult(null)
            setError('')
            setConflict(false)
            onChanged()
          }}
        >
          Reload ticket
        </button>
      )}
      {s && (
        <>
          {row(
            'Category',
            ticket.category?.name ?? 'Current category',
            s.category.name,
            s.category,
            permissions.edit,
            () =>
              updateTicket(ticket.id, {
                categoryId: s.category.id!,
                expectedUpdatedAt,
              }),
          )}
          {row(
            'Priority',
            ticket.priority,
            s.priority.value,
            s.priority,
            permissions.edit,
            () =>
              updateTicket(ticket.id, {
                priority: s.priority.value!,
                expectedUpdatedAt,
              }),
          )}
          {s.tags.length === 0 && (
            <p className="quiet-note">No tag suggestions.</p>
          )}
          {s.tags.map((tag) =>
            row(
              `Tag: ${tag.name}`,
              ticket.tags?.map((t) => t.name).join(', ') || 'None',
              tag.name,
              tag,
              permissions.edit && !ticket.tagIds.includes(tag.id!),
              () =>
                updateTicket(ticket.id, {
                  tagIds: [...new Set([...ticket.tagIds, tag.id!])],
                  expectedUpdatedAt,
                }),
              `Add tag ${tag.name}`,
            ),
          )}
          {row(
            'Team',
            ticket.ownership.team?.name ?? 'Unassigned',
            s.team.name,
            s.team,
            permissions.assignTeam,
            () =>
              assignTicket(
                ticket.id,
                s.team.id!,
                ticket.assignedAgentId,
                expectedUpdatedAt,
              ),
          )}
          {row(
            'Agent',
            ticket.ownership.agent?.displayName ?? 'Unassigned',
            s.agent.name,
            s.agent,
            permissions.assignAgent &&
              s.team.id !== null &&
              s.team.confidence >= 0.55,
            () =>
              assignTicket(
                ticket.id,
                s.team.id!,
                s.agent.id!,
                expectedUpdatedAt,
              ),
            `Apply agent with team ${s.team.name ?? ''}`,
          )}
          <p className="quiet-note">
            Each successful change clears these suggestions. Generate again to
            review the updated ticket. Team changes preserve the current agent;
            incompatible assignments require manual review.
          </p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setResult(null)}
          >
            Dismiss suggestions
          </button>
        </>
      )}
    </section>
  )
}
