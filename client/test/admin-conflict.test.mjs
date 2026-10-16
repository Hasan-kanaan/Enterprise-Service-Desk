import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requiresAdministrationReload } from '../src/components/admin-conflict.ts'

test('ordinary conflicts remain editable, including unknown 409s', () => {
  for (const message of ['A region with this name already exists', 'This name is already reserved, including archived records', 'Duplicate relationship', 'Choose another region', '']) {
    assert.equal(requiresAdministrationReload(409, message), false)
  }
  assert.equal(requiresAdministrationReload(400, 'Invalid name'), false)
  assert.equal(requiresAdministrationReload(undefined, ''), false)
})
test('known stale conditions retain reload and status alone does not classify 409', () => {
  for (const message of ['Data changed concurrently; reload before retrying', 'Region is archived', 'Department is archived', 'Team is archived', 'Specialty is archived', 'Agent must be active and activated']) {
    assert.equal(requiresAdministrationReload(409, message), true)
    assert.equal(requiresAdministrationReload(500, message), false)
  }
  assert(requiresAdministrationReload(403, 'Forbidden'))
  assert(requiresAdministrationReload(404, 'Not found'))
})
