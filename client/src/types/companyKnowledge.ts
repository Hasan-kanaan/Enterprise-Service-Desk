export type CompanyKnowledgeVersionStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY_FOR_REVIEW'
  | 'PUBLISHED'
  | 'DEACTIVATED'
  | 'FAILED'

export type CompanyKnowledgeStatusUpdate = {
  documentId: number
  versionId: number
  status: CompanyKnowledgeVersionStatus
  stage: string | null
  processingStartedAt: string | null
  updatedAt: string
}

export type CompanyKnowledgeVersion = {
  id: number
  versionNumber: number
  originalName: string
  contentType: string
  byteSize: number
  status: CompanyKnowledgeVersionStatus
  processingError: string | null
  processingStartedAt: string | null
  createdAt: string
  updatedAt: string
}

export type CompanyKnowledgeDocument = {
  id: number
  title: string
  createdAt: string
  updatedAt: string
  _count: { versions: number }
  versions: CompanyKnowledgeVersion[]
}

export type CompanyKnowledgeList = {
  items: CompanyKnowledgeDocument[]
  hasMore: boolean
  nextCursor: string | null
}
