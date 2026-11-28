import api from './api'
import type { CompanyKnowledgeList } from '@/types/companyKnowledge'

export async function listCompanyKnowledge(
  signal?: AbortSignal,
  cursor?: string,
) {
  return (
    await api.get<CompanyKnowledgeList>('/company-knowledge/documents', {
      signal,
      params: { limit: 100, ...(cursor ? { cursor } : {}) },
    })
  ).data
}

export async function uploadCompanyKnowledge(file: File) {
  const form = new FormData()
  form.append('file', file)
  return (
    await api.post('/company-knowledge/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  ).data
}

export async function retryCompanyKnowledgeVersion(versionId: number) {
  return (
    await api.post(`/company-knowledge/versions/${versionId}/retry`)
  ).data
}
