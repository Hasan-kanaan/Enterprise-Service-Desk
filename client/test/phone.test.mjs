import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptsPhoneEdit, phoneParts, readPhone } from '../src/components/phone.ts'

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

for (const [country, number] of [
  ['LB', '71 123 456'], ['US', '(202) 555-0123'],
  ['CA', '(416) 555-0123'], ['GB', '020 7946 0018'],
]) test(`${country}: metadata length budget and edits`, () => {
  assert(acceptsPhoneEdit('', number, country))
  assert(!acceptsPhoneEdit(number, number + '9', country))
  assert(!acceptsPhoneEdit('', number + '999999', country), 'overlong paste is rejected whole')
  assert(acceptsPhoneEdit(number, number.slice(0, -1), country))
  assert(acceptsPhoneEdit(number, number.slice(0, -1) + '2', country))
  assert(acceptsPhoneEdit(number, number + ' - ', country), 'separators cost no digits')
  assert(acceptsPhoneEdit(number, '', country))
})
test('international paste uses its own plan and country changes recalculate length', () => {
  assert(acceptsPhoneEdit('', '+44 20 7946 0018', 'LB'))
  assert(!acceptsPhoneEdit('', '+44 20 7946 00189999', 'LB'))
  assert(!acceptsPhoneEdit('', '2025550123', 'LB'))
  assert(acceptsPhoneEdit('', '2025550123', 'US'))
  assert(acceptsPhoneEdit('2025550123', '202555012', 'LB'), 'can shorten retained overlong input')
  assert(acceptsPhoneEdit('', '71', 'LB'), 'too short can be typed but remains invalid')
  assert.equal(readPhone('71', 'LB').valid, false)
})
