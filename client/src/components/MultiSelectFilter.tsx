import { ChevronDown } from 'lucide-react'

export function MultiSelectFilter({ label, options, selected, onChange, allLabel = 'All' }: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (values: string[]) => void
  allLabel?: string
}) {
  const all = selected.length === 0
  const toggle = (value: string) => onChange(
    selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value],
  )
  const selectedLabel = selected.length <= 2
    ? options.filter(option => selected.includes(option.value)).map(option => option.label).join(', ')
    : `${selected.length} selected`
  return <details className="multi-select-filter" key={label}>
    <summary aria-label={label}>{all ? allLabel : selectedLabel}<ChevronDown className="multi-select-chevron" size={16} aria-hidden="true" /></summary>
    <div className="multi-select-options">
      <p className="quiet-note">Select any options; no selection means all.</p>
      {options.map(option => <label key={option.value}>
        <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} />{option.label}
      </label>)}
    </div>
  </details>
}
