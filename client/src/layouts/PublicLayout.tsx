import { Outlet } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'

export function PublicLayout() {
  return (
    <main className="relative min-h-svh overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(56,163,184,0.16),_transparent_34%),linear-gradient(135deg,_#eef5f7_0%,_#f8fafb_48%,_#e8eef2_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,_rgba(36,112,128,0.28),_transparent_35%),linear-gradient(135deg,_#0f1a21_0%,_#111a20_48%,_#17262e_100%)] dark:text-slate-100">
      <header className="absolute inset-x-0 top-0 z-10 px-5 py-5 sm:px-8 lg:px-12">
        <BrandMark />
      </header>
      <div className="mx-auto flex min-h-svh w-full max-w-7xl items-center px-5 py-24 sm:px-8 lg:px-12">
        <Outlet />
      </div>
    </main>
  )
}
