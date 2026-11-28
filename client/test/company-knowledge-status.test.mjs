import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyCompanyKnowledgeStatus,
  companyKnowledgeStatusDisplay,
  elapsedProcessingMinutes,
  isCompanyKnowledgeStatusUpdateNotOlder,
} from '../src/company-knowledge-status.ts'

test('presents queue, processing, ready, failed, and terminal statuses correctly', () => {
  const now = Date.parse('2026-01-01T00:02:00.000Z')

  assert.deepEqual(companyKnowledgeStatusDisplay('UPLOADED', null, now), {
    label: 'Waiting in queue',
    processing: false,
    elapsedMinutes: null,
  })
  assert.deepEqual(
    companyKnowledgeStatusDisplay(
      'PROCESSING',
      '2026-01-01T00:00:00.000Z',
      now,
    ),
    {
      label: 'Extracting document text',
      processing: true,
      elapsedMinutes: 2,
    },
  )
  assert.equal(companyKnowledgeStatusDisplay('READY_FOR_REVIEW', null, now).label, 'Ready for review')
  assert.equal(companyKnowledgeStatusDisplay('FAILED', null, now).label, 'Failed')
  assert.equal(companyKnowledgeStatusDisplay('PUBLISHED', null, now).label, 'Published')
  assert.equal(companyKnowledgeStatusDisplay('DEACTIVATED', null, now).label, 'Deactivated')
})

test('elapsed minutes derive from the persisted processing start time', () => {
  const startedAt = '2026-01-01T00:00:00.000Z'
  const start = Date.parse(startedAt)

  assert.equal(elapsedProcessingMinutes(startedAt, start + 59_999), 0)
  assert.equal(elapsedProcessingMinutes(startedAt, start + 60_000), 1)
  assert.equal(elapsedProcessingMinutes(startedAt, start - 60_000), 0)
  assert.equal(elapsedProcessingMinutes(null, start), null)
})

test('ignores a stale status update that arrives after a newer REST snapshot', () => {
  const version = {
    id: 12,
    versionNumber: 1,
    originalName: 'handbook.txt',
    contentType: 'text/plain',
    byteSize: 10,
    status: 'READY_FOR_REVIEW',
    processingError: null,
    processingStartedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:02:00.000Z',
  }
  const stale = {
    documentId: 4,
    versionId: 12,
    status: 'PROCESSING',
    stage: 'Extracting document text',
    processingStartedAt: version.processingStartedAt,
    updatedAt: '2026-01-01T00:01:00.000Z',
  }

  assert.equal(applyCompanyKnowledgeStatus(version, stale), version)
})

test('rejects a socket update older than either socket or REST state', () => {
  const update = {
    documentId: 4,
    versionId: 12,
    status: 'READY_FOR_REVIEW',
    stage: null,
    processingStartedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:03:00.000Z',
  }
  const previous = { ...update, updatedAt: '2026-01-01T00:01:00.000Z' }

  assert.equal(
    isCompanyKnowledgeStatusUpdateNotOlder(
      { ...update, updatedAt: '2026-01-01T00:00:30.000Z' },
      previous,
      '2026-01-01T00:00:00.000Z',
    ),
    false,
  )
  assert.equal(
    isCompanyKnowledgeStatusUpdateNotOlder(
      { ...update, updatedAt: previous.updatedAt },
      previous,
      '2026-01-01T00:00:00.000Z',
    ),
    false,
  )
  assert.equal(
    isCompanyKnowledgeStatusUpdateNotOlder(
      { ...update, updatedAt: '2026-01-01T00:02:00.000Z' },
      previous,
      '2026-01-01T00:02:30.000Z',
    ),
    false,
  )
  assert.equal(
    isCompanyKnowledgeStatusUpdateNotOlder(
      { ...update, updatedAt: '2026-01-01T00:02:30.000Z' },
      previous,
      '2026-01-01T00:02:30.000Z',
    ),
    false,
  )
  assert.equal(
    isCompanyKnowledgeStatusUpdateNotOlder(
      update,
      previous,
      '2026-01-01T00:02:30.000Z',
    ),
    true,
  )
})
