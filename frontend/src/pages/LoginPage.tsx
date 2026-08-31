import { useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, LoaderCircle, Lock, Mail, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import loginDocuments from '@/assets/login-documents.png'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState({ email: false, password: false })

  const emailInvalid = touched.email && email.trim() !== '' && !EMAIL_PATTERN.test(email.trim())
  const passwordInvalid = touched.password && password.length > 0 && password.length < 6

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setTouched({ email: true, password: true })

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
    <main className="login-centered">
      <section className="login-workspace" aria-label="Enterprise AI login">
        <div className="login-panel">
          <div className="login-card-header">
            <h1>{isId ? 'Masuk' : 'Sign in'}</h1>
            <p>{isId ? 'Gunakan akun perusahaan Anda untuk melanjutkan.' : 'Use your company account to continue.'}</p>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <ShieldAlert size={15} /> {error}
            </div>
          )}

          <form className="login-form-centered" onSubmit={handleSubmit} noValidate>
            <div className={`login-field ${emailInvalid ? 'invalid' : ''}`}>
              <label htmlFor="login-email">{isId ? 'Alamat email' : 'Email address'}</label>
              <div className="login-input-wrap">
                <Mail size={16} className="login-input-icon" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  placeholder={isId ? 'anda@perusahaan.com' : 'you@company.com'}
                  autoComplete="email"
                  disabled={submitting}
                />
              </div>
              {emailInvalid && <span className="login-field-error">{isId ? 'Masukkan alamat email yang valid.' : 'Please enter a valid email address.'}</span>}
            </div>

            <div className={`login-field ${passwordInvalid ? 'invalid' : ''}`}>
              <label htmlFor="login-password">{isId ? 'Kata sandi' : 'Password'}</label>
              <div className="login-input-wrap">
                <Lock size={16} className="login-input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  placeholder={isId ? 'Masukkan kata sandi Anda' : 'Enter your password'}
                  autoComplete="current-password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? (isId ? 'Sembunyikan kata sandi' : 'Hide password') : (isId ? 'Tampilkan kata sandi' : 'Show password')}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {passwordInvalid && <span className="login-field-error">{isId ? 'Kata sandi harus minimal 6 karakter.' : 'Password must be at least 6 characters.'}</span>}
            </div>

            <button className="login-submit" type="submit" disabled={submitting}>
              {submitting ? (
                <><LoaderCircle size={16} className="spin" /> {isId ? 'Memverifikasi…' : 'Verifying…'}</>
              ) : (
                isId ? 'Masuk ke workspace' : 'Enter workspace'
              )}
            </button>
          </form>

        </div>

        <aside className="login-knowledge" aria-label="Knowledge workspace preview">
          <img src={loginDocuments} alt="" />
          <div className="login-visual-copy">
            <span>{isId ? 'ENTERPRISE AI KNOWLEDGE SYSTEM' : 'ENTERPRISE AI KNOWLEDGE SYSTEM'}</span>
            <p>{isId ? 'SOP, kebijakan, dan prosedur perusahaan yang selalu dapat ditelusuri ke sumbernya.' : 'Company SOPs, policies, and procedures that remain traceable to their source.'}</p>
          </div>
        </aside>
      </section>
    </main>
  )
}
