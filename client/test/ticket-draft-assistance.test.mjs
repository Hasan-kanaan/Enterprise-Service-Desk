import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assistedDraftPatch } from '../src/components/ticket-draft-assistance.ts'

const source = { title: 'Original title', description: 'My company VPN cannot connect from the Beirut Operations office.', categoryId: 5, priority: 'LOW', tagIds: [8], allRegions: true, allDepartments: true, affectedRegionIds: [12], affectedDepartmentIds: [13] }
const options = { categories: [{ id: 4 }, { id: 5 }], tags: [{ id: 7 }, { id: 8 }, { id: 9 }], regions: [{ id: 2 }], departments: [{ id: 3 }] }
const choice = id => ({ id, confidence: .9, reason: 'Evidence' })
const result = () => ({ scope: { status: 'IN_SCOPE', confidence: .9 }, suggestions: { title: 'VPN connection failure', description: 'The company VPN cannot connect in the Beirut Operations office.', category: choice(4), priority: { value: 'HIGH', confidence: .9 }, tags: [choice(7)], region: choice(2), department: choice(3) } })
const patch = data => assistedDraftPatch(data, source, structuredClone(source), options)
test('populates all accepted fields while merging tags and explicitly selecting scope', () => {
  assert.deepEqual(patch(result()), { title: 'VPN connection failure', description: 'The company VPN cannot connect in the Beirut Operations office.', categoryId: 4, priority: 'HIGH', tagIds: [8, 7], allRegions: false, affectedRegionIds: [2], allDepartments: false, affectedDepartmentIds: [3] })
  assert.deepEqual(source.tagIds, [8])
})
for (const scope of ['OUT_OF_SCOPE', 'NEEDS_MORE_INFORMATION']) test(scope + ' never alters draft fields', () => {
  const data = result(); data.scope.status = scope
  assert.deepEqual(patch(data), {})
})
test('nulls and empty tags preserve every existing value', () => {
  const data = result()
  Object.assign(data.suggestions, { title: null, description: null, category: choice(null), priority: { value: null, confidence: .9 }, tags: [], region: choice(null), department: choice(null) })
  assert.deepEqual(patch(data), {})
})
for (const score of [.54, NaN, Infinity, 1.1]) test('invalid/weak scope confidence preserves all fields: ' + score, () => {
  const data = result(); data.scope.confidence = score
  assert.deepEqual(patch(data), {})
})
test('low-confidence choices stay unchanged while accepted rewrites populate', () => {
  const data = result()
  for (const item of [data.suggestions.category, data.suggestions.priority, data.suggestions.region, data.suggestions.department, ...data.suggestions.tags]) item.confidence = .54
  assert.deepEqual(Object.keys(patch(data)).sort(), ['description', 'title'])
})
test('invalid or removed candidates and priority do not clear selections', () => {
  const data = result()
  for (const item of [data.suggestions.category, data.suggestions.region, data.suggestions.department, ...data.suggestions.tags]) item.id = 999
  data.suggestions.priority.value = 'UNKNOWN'
  assert.deepEqual(Object.keys(patch(data)).sort(), ['description', 'title'])
})
test('invalid rewrites stay unchanged', () => {
  const data = result(); data.suggestions.title = 'x'.repeat(201); data.suggestions.description = 'x'.repeat(3001)
  assert(!('title' in patch(data))); assert(!('description' in patch(data)))
})
test('at most three AI tags merge without deleting existing tags or adding duplicates', () => {
  const data = result(); data.suggestions.tags = [choice(7), choice(8), choice(9), choice(999)]
  assert.deepEqual(patch(data).tagIds, [8, 7, 9])
})
test('title or description edits while pending reject the entire stale response', () => {
  for (const field of ['title', 'description']) assert.deepEqual(assistedDraftPatch(result(), source, { ...source, [field]: 'A different IT issue requiring support.' }, options), {})
})
test('individual fields edited while pending are preserved, including scope toggles', () => {
  const current = { ...source, categoryId: 4, priority: 'CRITICAL', tagIds: [9], allRegions: false, affectedDepartmentIds: [30] }
  assert.deepEqual(Object.keys(assistedDraftPatch(result(), source, current, options)).sort(), ['description', 'title'])
})
test('unchanged proposals create no patch or unnecessary Undo snapshot', () => {
  const data = result(), applied = { ...source, ...patch(data) }
  assert.deepEqual(assistedDraftPatch(data, applied, applied, options), {})
})
