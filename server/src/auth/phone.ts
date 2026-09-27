export function normalizePhone(value: unknown): unknown {
  return typeof value === 'string'
    ? value.trim().replace(/[ ()-]/g, '')
    : value;
}
