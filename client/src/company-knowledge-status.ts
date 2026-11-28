import type {
  CompanyKnowledgeStatusUpdate,
  CompanyKnowledgeVersion,
  CompanyKnowledgeVersionStatus,
} from '@/types/companyKnowledge'

export function companyKnowledgeStatusDisplay(
  status: CompanyKnowledgeVersionStatus,
  processingStartedAt: string | null,
  now: number,
) {
  switch (status) {
    case 'UPLOADED':
      return { label: 'Waiting in queue', processing: false, elapsedMinutes: null }
    case 'PROCESSING':
      return {
        label: 'Extracting document text',
        processing: true,
        elapsedMinutes: elapsedProcessingMinutes(processingStartedAt, now),
      }
    case 'READY_FOR_REVIEW':
      return { label: 'Ready for review', processing: false, elapsedMinutes: null }
    case 'FAILED':
      return { label: 'Failed', processing: false, elapsedMinutes: null }
    case 'PUBLISHED':
      return { label: 'Published', processing: false, elapsedMinutes: null }
    case 'DEACTIVATED':
      return { label: 'Deactivated', processing: false, elapsedMinutes: null }
  }
}

export function elapsedProcessingMinutes(
  processingStartedAt: string | null,
  now = Date.now(),
) {
  if (!processingStartedAt) return null
  const startedAt = Date.parse(processingStartedAt)
  if (!Number.isFinite(startedAt)) return null
  return Math.floor(Math.max(0, now - startedAt) / 60_000)
}

export function isCompanyKnowledgeStatusUpdateNotOlder(
  update: CompanyKnowledgeStatusUpdate,
  previous?: CompanyKnowledgeStatusUpdate,
  restUpdatedAt?: string,
) {
  const updatedAt = Date.parse(update.updatedAt)
  if (!Number.isFinite(updatedAt)) return false
  if (previous && Date.parse(previous.updatedAt) >= updatedAt) return false
  if (restUpdatedAt && Date.parse(restUpdatedAt) >= updatedAt) return false
  return true
}

export function applyCompanyKnowledgeStatus(
  version: CompanyKnowledgeVersion,
  update: CompanyKnowledgeStatusUpdate,
): CompanyKnowledgeVersion {
  if (
    version.id !== update.versionId ||
    !isCompanyKnowledgeStatusUpdateNotOlder(
      update,
      undefined,
      version.updatedAt,
    )
  )
    return version
  return {
    ...version,
    status: update.status,
    processingStartedAt: update.processingStartedAt,
    updatedAt: update.updatedAt,
  }
}
