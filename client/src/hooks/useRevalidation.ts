import { useEffect, useEffectEvent } from 'react'

// Event-driven only. Coalesce focus/pageshow bursts; never poll or retry failures.
export function useRevalidation(reload: () => void, busy = false) {
  const revalidate = useEffectEvent(() => { if (!busy) reload() })
  useEffect(() => {
    let last = 0
    const resume = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 2000) return
      last = Date.now()
      revalidate()
    }
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    return () => {
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
    }
  }, [])
}
