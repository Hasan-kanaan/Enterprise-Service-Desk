import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { LoaderCircle, RotateCcw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorState, LoadingState } from '@/components/TicketUI'
import { useResource } from '@/hooks/useResource'
import { useAppSelector } from '@/hooks/storeHooks'
import { getApiErrorMessage } from '@/services/api'
import {
  listCompanyKnowledge,
  retryCompanyKnowledgeVersion,
  uploadCompanyKnowledge,
} from '@/services/company-knowledge.service'
import { subscribeCompanyKnowledgeStatus } from '@/services/company-knowledge-status.socket'
import {
  applyCompanyKnowledgeStatus,
  companyKnowledgeStatusDisplay,
  isCompanyKnowledgeStatusUpdateNotOlder,
} from '@/company-knowledge-status'
import type {
  CompanyKnowledgeDocument,
  CompanyKnowledgeStatusUpdate,
  CompanyKnowledgeVersion,
} from '@/types/companyKnowledge'
import '@/company-knowledge.css'

export function CompanyKnowledgePage() {
  const token = useAppSelector((state) => state.auth.accessToken)
  const resource = useResource(listCompanyKnowledge)
  const reload = resource.reload
  const [updates, setUpdates] = useState<Record<number, CompanyKnowledgeStatusUpdate>>({})
  const updatesRef = useRef(updates)
  const [now, setNow] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [retryingVersion, setRetryingVersion] = useState<number | null>(null)
  const [extraPages, setExtraPages] = useState<{
    base: NonNullable<typeof resource.data>
    items: CompanyKnowledgeDocument[]
    cursor: string | null
  } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const restUpdatedAt = useMemo(() => {
    const additionalItems =
      extraPages && extraPages.base === resource.data ? extraPages.items : []
    return new Map(
      [...(resource.data?.items ?? []), ...additionalItems].flatMap(
        (document) =>
          document.versions.map(
            (version) => [version.id, version.updatedAt] as const,
          ),
      ),
    )
  }, [extraPages, resource.data])
  const restUpdatedAtRef = useRef(restUpdatedAt)
  useLayoutEffect(() => {
    restUpdatedAtRef.current = restUpdatedAt
  }, [restUpdatedAt])

  useEffect(() => {
    if (!token) return
    return subscribeCompanyKnowledgeStatus(token, {
      onStatus: (status) => {
        const previous = updatesRef.current[status.versionId]
        if (
          !isCompanyKnowledgeStatusUpdateNotOlder(
            status,
            previous,
            restUpdatedAtRef.current.get(status.versionId),
          )
        )
          return
        const next = { ...updatesRef.current, [status.versionId]: status }
        updatesRef.current = next
        setUpdates(next)
        if (status.status === 'FAILED') reload()
      },
      onConnected: reload,
    })
  }, [token, reload])

  const nextCursor =
    extraPages && extraPages.base === resource.data
      ? extraPages.cursor
      : resource.data?.nextCursor ?? null
  const documents = useMemo(() => {
    const pageItems =
      extraPages && extraPages.base === resource.data ? extraPages.items : []
    const items = [...(resource.data?.items ?? []), ...pageItems]
    return items.map((document) => ({
      ...document,
      versions: document.versions.map((version) =>
        updates[version.id]
          ? applyCompanyKnowledgeStatus(version, updates[version.id])
          : version,
      ),
    }))
  }, [extraPages, resource.data, updates])

  const processing = documents.some(
    (document) => document.versions[0]?.status === 'PROCESSING',
  )
  useEffect(() => {
    if (!processing) return
    const refresh = () => setNow(Date.now())
    const startTimer = window.setTimeout(refresh, 0)
    const timer = window.setInterval(refresh, 15_000)
    return () => {
      window.clearTimeout(startTimer)
      window.clearInterval(timer)
    }
  }, [processing])

  const uploadFile = async () => {
    if (!file || uploading) return
    setUploading(true)
    try {
      await uploadCompanyKnowledge(file)
      setFile(null)
      setExtraPages(null)
      resource.reload()
      toast.success('Company document added to the queue')
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, 'The company document could not be uploaded.'),
      )
    } finally {
      setUploading(false)
    }
  }

  const retry = async (versionId: number) => {
    if (retryingVersion !== null) return
    setRetryingVersion(versionId)
    try {
      await retryCompanyKnowledgeVersion(versionId)
      resource.reload()
      toast.success('Document queued for processing')
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, 'The document could not be retried.'),
      )
    } finally {
      setRetryingVersion(null)
    }
  }

  const loadMore = useCallback(async () => {
    const base = resource.data
    if (!base || !nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await listCompanyKnowledge(undefined, nextCursor)
      setExtraPages((current) => ({
        base,
        items: [
          ...(current?.base === base ? current.items : []),
          ...page.items,
        ],
        cursor: page.nextCursor,
      }))
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, 'More company documents could not be loaded.'),
      )
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, nextCursor, resource.data])

  if (resource.loading && !resource.data)
    return <LoadingState variant="page" label="Loading company knowledge..." />
  if (resource.error || !resource.data)
    return (
      <ErrorState
        error={resource.error}
        onRetry={resource.reload}
        resourceName="company knowledge"
      />
    )

  return (
    <div className="ticket-workspace company-knowledge-page">
      <header className="page-heading">
        <div>
          <h1>Company knowledge</h1>
          <p className="muted">
            Add reference documents and track their processing status.
          </p>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={resource.reload}
          disabled={resource.loading}
        >
          <RotateCcw size={15} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <section className="panel company-knowledge-upload">
        <div>
          <h2>Add a document</h2>
          <p className="quiet-note">PDF, DOCX, TXT, or Markdown. Maximum 50 MiB.</p>
        </div>
        <label className="company-knowledge-file">
          <span>Choose a company document</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md,.markdown"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            disabled={uploading}
          />
        </label>
        <button
          className="button primary"
          type="button"
          onClick={() => void uploadFile()}
          disabled={!file || uploading}
        >
          <Upload size={15} aria-hidden="true" />
          {uploading ? 'Uploading...' : 'Add to queue'}
        </button>
      </section>

      <section className="panel company-knowledge-list" aria-label="Company documents">
        <div className="company-knowledge-list-heading">
          <h2>Documents</h2>
          <span className="quiet-note">{documents.length} shown</span>
        </div>
        {documents.length ? (
          <ul className="company-knowledge-items">
            {documents.map((document) => {
              const version = document.versions[0]
              if (!version) return null
              return (
                <CompanyKnowledgeRow
                  key={document.id}
                  document={document}
                  version={version}
                  now={now}
                  retrying={retryingVersion === version.id}
                  onRetry={() => void retry(version.id)}
                />
              )
            })}
          </ul>
        ) : (
          <p className="company-knowledge-empty">
            No company documents yet. Add a document to start the queue.
          </p>
        )}
        {nextCursor ? (
          <div className="company-knowledge-more">
            <button
              className="button secondary"
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function CompanyKnowledgeRow({
  document,
  version,
  now,
  retrying,
  onRetry,
}: {
  document: CompanyKnowledgeDocument
  version: CompanyKnowledgeVersion
  now: number
  retrying: boolean
  onRetry: () => void
}) {
  const display = companyKnowledgeStatusDisplay(
    version.status,
    version.processingStartedAt,
    now,
  )
  const statusClass = version.status.toLowerCase().replaceAll('_', '-')

  return (
    <li className="company-knowledge-item">
      <div className="company-knowledge-item-main">
        <div className="company-knowledge-item-title">
          <h3>{document.title}</h3>
          <span className="quiet-note">
            Version {version.versionNumber} · {version.originalName}
          </span>
        </div>
        <div className="company-knowledge-item-state">
          <span className={`status-badge company-knowledge-status-${statusClass}`}>
            {display.processing && (
              <LoaderCircle
                size={14}
                className="company-knowledge-spinner"
                aria-hidden="true"
              />
            )}
            {display.label}
          </span>
          {display.processing && display.elapsedMinutes !== null && (
            <span className="quiet-note">{display.elapsedMinutes} min elapsed</span>
          )}
          {version.status === 'FAILED' && version.processingError && (
            <p className="company-knowledge-error">{version.processingError}</p>
          )}
        </div>
      </div>
      {version.status === 'FAILED' && (
        <button
          className="button secondary"
          type="button"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? 'Retrying...' : 'Retry'}
        </button>
      )}
    </li>
  )
}
