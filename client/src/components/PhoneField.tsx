import { useId, useState } from 'react'
import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from 'libphonenumber-js/max'
import { acceptsPhoneEdit, phoneParts, readPhone } from './phone'

const names = new Intl.DisplayNames(['en'], { type: 'region' })
const countries = getCountries().sort((a, b) =>
  (names.of(a) ?? a).localeCompare(names.of(b) ?? b),
)

export function PhoneField({
  value,
  onChange,
  onValidityChange,
}: {
  value: string
  onChange: (value: string) => void
  onValidityChange: (valid: boolean) => void
}) {
  const [parts, setParts] = useState(() => phoneParts(value))
  const [touched, setTouched] = useState(false)
  const id = useId()
  const result = readPhone(parts.text, parts.country || undefined)
  const update = (text: string, country: CountryCode | '') => {
    const parsed = readPhone(text, country || undefined)
    if (text.trim().startsWith('+') && parsed.valid && parsed.phone) {
      country = parsed.phone.country ?? ''
      text = parsed.phone.country ? parsed.phone.formatNational() : text
    }
    setParts({ text, country })
    onChange(parsed.value)
    onValidityChange(parsed.valid)
  }
  return (
    <div className="field phone-field">
      <label htmlFor={id}>Phone number (optional)</label>
      <div className="phone-control" role="group" aria-label="Phone number">
        <select
          aria-label="Phone country"
          value={parts.country}
          onChange={(e) => {
            setTouched(true)
            update(
              parts.text.replace(/^\+/, ''),
              e.target.value as CountryCode | '',
            )
          }}
        >
          <option value="">International</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {names.of(country)}
            </option>
          ))}
        </select>
        {parts.country && (
          <span className="phone-code">
            +{getCountryCallingCode(parts.country)}
          </span>
        )}
        <input
          id={id}
          aria-label="Account phone"
          type="tel"
          autoComplete="tel-national"
          inputMode="tel"
          value={parts.text}
          placeholder={
            parts.country ? 'National number' : '+international number'
          }
          aria-invalid={touched && !result.valid}
          aria-describedby={`${id}-help${touched && !result.valid ? ` ${id}-error` : ''}`}
          onChange={(e) => {
            if (acceptsPhoneEdit(parts.text, e.target.value, parts.country || undefined)) {
              update(e.target.value, parts.country)
            }
          }}
          onBlur={() => {
            setTouched(true)
            if (result.valid && result.phone?.country)
              setParts((p) => ({ ...p, text: result.phone!.formatNational() }))
          }}
        />
      </div>
      <span id={`${id}-help`} className="quiet-note">
        Unverified. Not used for sign-in or password recovery. Leave blank to
        clear.
      </span>
      {touched && !result.valid && (
        <span id={`${id}-error`} className="phone-error" role="status">
          Enter a valid number for the selected country, or paste a number
          starting with +.
        </span>
      )}
    </div>
  )
}
