import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import '@/public-auth.css'

export function PublicAuthCard({ children }: { children: ReactNode }) {
  return <section className="public-auth-card">{children}</section>
}

export function ReturnToSignIn() {
  return <nav className="public-auth-navigation" aria-label="Sign-in navigation">
    <Link to="/login"><ArrowLeft size={16} aria-hidden="true" />Return to sign in</Link>
  </nav>
}
