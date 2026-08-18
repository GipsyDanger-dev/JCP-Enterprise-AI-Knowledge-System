import { useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, FileText, LoaderCircle, Lock, Mail, ShieldAlert, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
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
    <main className="login-layout">
      {/* Left: branding panel */}
      <div className="login-brand-panel">
        <div className="brand-panel-content">
          <div className="brand-panel-logo">
            <span className="brand-panel-icon"><Sparkles size={28} /></span>
          </div>
          <h1 className="brand-panel-title">Enterprise AI</h1>
          <p className="brand-panel-tagline">Knowledge management platform with AI-powered search & citation.</p>

          <div className="brand-features">
            <div className="brand-feature">
              <span className="feature-icon"><FileText size={18} /></span>
              <div>
                <strong>Document Intelligence</strong>
                <small>Upload, index, and search across all company documents</small>
              </div>
            </div>
            <div className="brand-feature">
              <span className="feature-icon"><Sparkles size={18} /></span>
              <div>
                <strong>AI-Powered Answers</strong>
                <small>Ask questions and get grounded answers with source citations</small>
              </div>
            </div>
            <div className="brand-feature">
              <span className="feature-icon"><Lock size={18} /></span>
              <div>
                <strong>Role-Based Access</strong>
                <small>Secure workspace with admin and employee role controls</small>
              </div>
            </div>
          </div>
        </div>

        <div className="brand-panel-dots" />
      </div>

      {/* Right: login form */}
      <div className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-form-header">
            <span className="login-form-logo"><Sparkles size={20} /></span>
            <h2>Welcome back</h2>
            <p>Sign in to access your knowledge workspace.</p>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <ShieldAlert size={15} /> {error}
            </div>
          )}

          <div className={`login-field ${emailInvalid ? 'invalid' : ''}`}>
            <label htmlFor="login-email">Email address</label>
            <div className="login-input-wrap">
              <Mail size={16} className="login-input-icon" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="you@company.com"
                autoComplete="email"
                disabled={submitting}
              />
            </div>
            {emailInvalid && <span className="login-field-error">Please enter a valid email address.</span>}
          </div>

          <div className={`login-field ${passwordInvalid ? 'invalid' : ''}`}>
            <label htmlFor="login-password">Password</label>
            <div className="login-input-wrap">
              <Lock size={16} className="login-input-icon" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={submitting}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordInvalid && <span className="login-field-error">Password must be at least 6 characters.</span>}
          </div>

          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? (
              <><LoaderCircle size={16} className="spin" /> Signing in…</>
            ) : (
              <><Lock size={16} /> Sign in</>
            )}
          </button>

          <p className="login-footer">
            Enterprise AI Knowledge System
          </p>
        </form>
      </div>
    </main>
  )
}
