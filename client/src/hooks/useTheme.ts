import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'
const key = 'kino-theme'
const parse = (value: string | null): Theme | null => value === 'light' || value === 'dark' ? value : null
const system = matchMedia('(prefers-color-scheme: dark)')
let preference: Theme | null = null
try { preference = parse(localStorage.getItem(key)) } catch { /* Use system/in-memory preference. */ }
let theme: Theme = preference ?? (system.matches ? 'dark' : 'light')
const listeners = new Set<() => void>()
function apply() {
  theme = preference ?? (system.matches ? 'dark' : 'light')
  document.documentElement.dataset.theme = theme
  listeners.forEach(listener => listener())
}
function storageChanged(event: StorageEvent) {
  if (event.key !== key && event.key !== null) return
  try { if (event.storageArea !== localStorage) return } catch { return }
  preference = parse(event.newValue)
  apply()
}
system.addEventListener('change', apply)
window.addEventListener('storage', storageChanged)
apply()
if (import.meta.hot) import.meta.hot.dispose(() => {
  system.removeEventListener('change', apply)
  window.removeEventListener('storage', storageChanged)
})
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function useTheme() {
  return useSyncExternalStore(subscribe, () => theme)
}
export function setTheme(value: Theme) {
  preference = value
  try { localStorage.setItem(key, value) } catch { /* Still apply for this page session. */ }
  apply()
}
