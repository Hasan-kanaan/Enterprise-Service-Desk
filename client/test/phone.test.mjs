import { test } from 'node:test'
import assert from 'node:assert/strict'
import { phoneParts, readPhone } from '../src/components/phone.ts'

for (const [country, national, expected] of [
  ['LB', '71 123 456', '+96171123456'],
  ['US', '(202) 555-0123', '+12025550123'],
  ['CA', '(416) 555-0123', '+14165550123'],
  ['GB', '020 7946 0018', '+442079460018'],
]) test(`${country}: national formatting, normalization and existing-value reconstruction`, () => {
  assert.equal(readPhone(national, country).value, expected)
  assert.equal(readPhone(national, country).valid, true)
  const parts = phoneParts(expected)
  assert.equal(parts.country, country)
  assert.equal(readPhone(parts.text, parts.country).value, expected)
})
test('international paste overrides default country', () => {
  const result = readPhone('+44 20 7946 0018', 'LB')
  assert.equal(result.value, '+442079460018')
  assert.equal(result.phone.country, 'GB')
})
test('optional blank remains blank', () => assert.deepEqual(readPhone(' ', 'LB'), { value: '', valid: true }))
test('too short, too long, extensions and letters are invalid', () => {
  for (const value of ['71', '+96171123456789012345678', '+12025550123 ext 42', 'call 71123456']) assert.equal(readPhone(value, 'LB').valid, false)
})
test('changing country revalidates the retained national digits', () => {
  assert.equal(readPhone('71123456', 'LB').valid, true)
  assert.equal(readPhone('71123456', 'US').valid, false)
  assert.equal(readPhone('2025550123', 'CA').valid, false)
})
