import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max'

export function readPhone(text: string, country?: CountryCode) {
  if (!text.trim()) return { value: '', valid: true }
  if (!/^\+?[\d\s().-]+$/.test(text.trim()))
    return { value: text, valid: false }
  const phone = parsePhoneNumberFromString(text, {
    defaultCountry: country,
    extract: false,
  })
  const valid =
    !!phone &&
    !phone.ext &&
    /^\+[1-9]\d{7,14}$/.test(phone.number) &&
    phone.isValid() &&
    (text.trim().startsWith('+') ||
      !country ||
      !phone.country ||
      phone.country === country)
  return { value: valid ? phone.number : text, valid, phone }
}

export function phoneParts(value: string) {
  const phone = parsePhoneNumberFromString(value)
  return {
    country: phone ? (phone.country ?? '') : value.startsWith('+') ? '' : 'LB',
    text: phone?.country ? phone.formatNational() : value,
  } as { country: CountryCode | ''; text: string }
}
