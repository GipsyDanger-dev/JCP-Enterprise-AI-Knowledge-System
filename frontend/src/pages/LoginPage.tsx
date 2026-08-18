import { useState } from 'react'
import type { FormEvent } from 'react'
import { LoaderCircle, Lock, ShieldAlert, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Email dan password wajib diisi.')
      return
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Format email tidak valid.')
      return
    }

    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <div className="auth-brand">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <strong>Enterprise AI</strong>
        </div>
        <h1>Sign in to your workspace</h1>
        <p className="auth-sub">Login untuk mengakses dokumen, AI assistant, dan knowledge base.</p>

        {error && <div className="auth-error" role="alert"><ShieldAlert size={15} /> {error}</div>}

        <div className="auth-field">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@perusahaan.co.id" autoComplete="email" />
        </div>

        <div className="auth-field">
          <label htmlFor="login-password">Password</label>
          <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" autoComplete="current-password" />
        </div>

        <button className="auth-submit" type="submit" disabled={submitting}>
          {submitting ? <><LoaderCircle size={16} className="spin" /> Memproses…</> : <><Lock size={16} /> Masuk</>}
        </button>


      </form>
    </main>
  )
}
