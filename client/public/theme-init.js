// Apply before application styles/rendering to avoid a wrong-theme first paint.
(() => {
  let preference
  try { preference = localStorage.getItem('kino-theme') } catch { /* Storage may be unavailable. */ }
  document.documentElement.dataset.theme = preference === 'light' || preference === 'dark'
    ? preference : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
})()
