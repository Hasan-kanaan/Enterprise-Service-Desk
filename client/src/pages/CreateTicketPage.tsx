import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { TicketForm } from '@/components/TicketForm'
import { ErrorState, LoadingState } from '@/components/TicketUI'
import { useResource } from '@/hooks/useResource'
import { createTicket, getTicketOptions } from '@/services/tickets.service'
import type { TicketInput } from '@/types/tickets'

export function CreateTicketPage() {
  const navigate = useNavigate()
  const options = useResource(getTicketOptions)
  const [error, setError] = useState<unknown>()
  const save = async (input: TicketInput) => {
    setError(undefined)
    try {
      const ticket = await createTicket(input)
      toast.success(`Ticket #${ticket.id} submitted`)
      navigate(`/tickets/${ticket.id}`, { replace: true })
    } catch (failure) {
      setError(failure)
    }
  }
  return (
    <div className="ticket-workspace form-page">
      <Link className="back-link" to="/tickets">
        <ArrowLeft size={16} />
        My tickets
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">A little context goes a long way</p>
          <h1>New support request</h1>
          <p className="muted">
            Tell us what is happening. Your request will go to the support team.
          </p>
        </div>
      </header>
      <div className="panel">
        {options.loading ? (
          <LoadingState label="Loading request options..." />
        ) : options.error ? (
          <ErrorState error={options.error} onRetry={options.reload} />
        ) : (
          options.data && (
            <>
              {options.data.categories.length === 0 && (
                <div className="notice" role="status">
                  Ticket categories have not been configured yet. Contact your
                  administrator before submitting a request.
                </div>
              )}
              {error && (
                <ErrorState
                  error={error}
                  message="We could not confirm submission. Check My tickets before trying again."
                />
              )}
              <TicketForm
                options={options.data}
                onSave={save}
                onCancel={() => navigate('/tickets')}
                submitLabel="Submit ticket"
              />
            </>
          )
        )}
      </div>
    </div>
  )
}
