import { Moon, Sun } from 'lucide-react'
import { setTheme, useTheme } from '@/hooks/useTheme'

export function ThemeToggle() {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = `Switch to ${next} theme`
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={() => setTheme(next)}>
    {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
  </button>
}
