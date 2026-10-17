import type {
  TicketInput,
  TicketOptions,
  TicketPriority,
} from '@/types/tickets'

type Choice = { id: number | null; confidence: number; reason: string }
export type DraftAssistance = {
  scope: {
    status: 'IN_SCOPE' | 'NEEDS_MORE_INFORMATION' | 'OUT_OF_SCOPE'
    confidence: number
    reasonCode: string
    message: string
  }
  suggestions: {
    title: string | null
    description: string | null
    category: Choice
    priority: {
      value: TicketPriority | null
      confidence: number
      reason: string
    }
    tags: Choice[]
    region: Choice
    department: Choice
  }
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b)
const confident = (value: number) =>
  Number.isFinite(value) && value >= 0.55 && value <= 1
export const draftFingerprint = (draft: TicketInput) =>
  JSON.stringify(
    [draft.title, draft.description].map((value) =>
      value.trim().replace(/\s+/g, ' '),
    ),
  )

// Server-validated rewrites only. Recheck selectable options and protect edits
// made while pending; normal creation remains authoritative.
export function assistedDraftPatch(
  data: DraftAssistance,
  source: TicketInput,
  current: TicketInput,
  options: TicketOptions,
): Partial<TicketInput> {
  const patch: Partial<TicketInput> = {}
  if (
    data.scope.status !== 'IN_SCOPE' ||
    !confident(data.scope.confidence) ||
    draftFingerprint(source) !== draftFingerprint(current)
  )
    return patch
  const set = (values: Partial<TicketInput>) => {
    const keys = Object.keys(values) as (keyof TicketInput)[]
    if (
      keys.every((key) => equal(source[key], current[key])) &&
      keys.some((key) => !equal(values[key], current[key]))
    )
      Object.assign(patch, values)
  }
  const eligible = (choice: Choice, list: { id: number }[]) =>
    choice.id !== null &&
    confident(choice.confidence) &&
    list.some((item) => item.id === choice.id)
  const s = data.suggestions
  if (typeof s.title === 'string' && s.title.trim() && s.title.length <= 200)
    set({ title: s.title })
  if (
    typeof s.description === 'string' &&
    s.description.trim() &&
    s.description.length <= 3000
  )
    set({ description: s.description })
  if (eligible(s.category, options.categories))
    set({ categoryId: s.category.id! })
  if (
    s.priority.value &&
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(s.priority.value) &&
    confident(s.priority.confidence)
  )
    set({ priority: s.priority.value })
  const tags = s.tags
    .slice(0, 3)
    .filter((tag) => eligible(tag, options.tags))
    .map((tag) => tag.id!)
  if (tags.length) set({ tagIds: [...new Set([...current.tagIds, ...tags])] })
  if (eligible(s.region, options.regions))
    set({ allRegions: false, affectedRegionIds: [s.region.id!] })
  if (eligible(s.department, options.departments))
    set({ allDepartments: false, affectedDepartmentIds: [s.department.id!] })
  return patch
}
