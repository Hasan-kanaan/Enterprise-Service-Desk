// Known stale-state messages from serializable() and organization eligibility
// checks. Unknown/business 409s remain editable; the server still validates every
// retry. Keep this narrow until the API has a structured recovery discriminator.
const staleConflicts = new Set([
  'Data changed concurrently; reload before retrying',
  'Region is archived',
  'Department is archived',
  'Team is archived',
  'Specialty is archived',
  'Agent must be active and activated',
])

export function requiresAdministrationReload(status: number | undefined, message: string) {
  return status === 403 || status === 404 || (status === 409 && staleConflicts.has(message))
}
