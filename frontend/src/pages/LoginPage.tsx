import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Building2,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  Lock,
  Mail,
  ShieldAlert,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApiError, errorMessage } from '@/api/client'
import { LogoMark } from '@/components/Logo'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import loginDocuments from '@/assets/login-documents.png'

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,50}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type AccountType = 'company' | 'personal'
type PersonalMode = 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, loginWithGoogle, registerPersonal } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [accountType, setAccountType] = useState<AccountType>('company')
  const [personalMode, setPersonalMode] = useState<PersonalMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [personalName, setPersonalName] = useState('')
  const [personalEmail, setPersonalEmail] = useState('')
  const [personalPassword, setPersonalPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState({ username: false, password: false })

  const usernameInvalid = touched.username && username.trim() !== '' && !USERNAME_PATTERN.test(username.trim())
  const passwordInvalid = touched.password && password.length > 0 && password.length < 6

  const selectAccountType = (type: AccountType) => {
    setAccountType(type)
    setError(null)
    setNotice(null)
    setShowPassword(false)
  }

  const selectPersonalMode = (mode: PersonalMode) => {
    setPersonalMode(mode)
    setError(null)
    setNotice(null)
    setShowPassword(false)
  }

  const handleCompanySubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setTouched({ username: true, password: true })

    if (!username.trim() || !password) {
      setError(isId ? 'Username dan kata sandi wajib diisi.' : 'Username and password are required.')
      return
    }
    if (!USERNAME_PATTERN.test(username.trim())) {
      setError(isId ? 'Format username belum sesuai.' : 'The username format is invalid.')
      return
    }

    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? (isId ? 'Username atau kata sandi salah.' : 'Invalid username or password.') : errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      await loginWithGoogle(credential)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(isId ? 'Email Google ini sudah terdaftar menggunakan metode login lain.' : 'This Google email is already registered with another sign-in method.')
      } else if (err instanceof ApiError && err.status === 401) {
        setError(isId ? 'Kredensial Google tidak valid atau sudah kedaluwarsa.' : 'The Google credential is invalid or expired.')
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }, [isId, loginWithGoogle, navigate])

  const handlePersonalSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (!personalEmail.trim() || !personalPassword || (personalMode === 'register' && !personalName.trim())) {
      setError(isId ? 'Lengkapi seluruh data yang wajib diisi.' : 'Complete all required fields.')
      return
    }
    if (!EMAIL_PATTERN.test(personalEmail.trim())) {
      setError(isId ? 'Masukkan alamat email yang valid.' : 'Enter a valid email address.')
      return
    }
    if (personalPassword.length < 8) {
      setError(isId ? 'Kata sandi personal minimal 8 karakter.' : 'Personal passwords must contain at least 8 characters.')
      return
    }
    if (personalMode === 'register' && personalPassword !== confirmPassword) {
      setError(isId ? 'Konfirmasi kata sandi tidak sama.' : 'Password confirmation does not match.')
      return
    }

    setSubmitting(true)
    try {
      if (personalMode === 'register') {
        await registerPersonal(
          personalName.trim(),
          personalEmail.trim().toLowerCase(),
          personalPassword,
          confirmPassword,
        )
      } else {
        await login(personalEmail.trim().toLowerCase(), personalPassword)
      }
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(isId ? 'Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.' : 'This email is already registered. Sign in or use another email.')
      } else if (err instanceof ApiError && err.status === 401) {
        setError(isId ? 'Email atau kata sandi salah.' : 'Invalid email or password.')
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-centered">
      <section className="login-workspace" aria-label="Enterprise AI authentication">
        <div className="login-panel">
          <div className="login-form-shell">
            <div className="login-brand">
              <LogoMark size={28} />
              <span>Enterprise AI</span>
            </div>

            <div className="login-card-header">
              <span className="login-eyebrow">{isId ? 'SATU WORKSPACE, DUA JENIS AKUN' : 'ONE WORKSPACE, TWO ACCOUNT TYPES'}</span>
              <h1>{accountType === 'company'
                ? (isId ? 'Selamat datang kembali' : 'Welcome back')
                : (personalMode === 'login'
                    ? (isId ? 'Masuk sebagai Personal' : 'Personal sign in')
                    : (isId ? 'Buat akun Personal' : 'Create a Personal account'))}</h1>
              <p>{accountType === 'company'
                ? (isId ? 'Masuk menggunakan akun yang diberikan perusahaan Anda.' : 'Sign in with the account provided by your company.')
                : (isId ? 'Kelola dokumen dan workspace milik Anda sendiri.' : 'Manage documents and a workspace of your own.')}</p>
            </div>

            <div className="login-account-switch" role="tablist" aria-label={isId ? 'Pilih jenis akun' : 'Choose account type'}>
              <button
                type="button"
                role="tab"
                aria-selected={accountType === 'company'}
                className={accountType === 'company' ? 'active' : ''}
                onClick={() => selectAccountType('company')}
              >
                <Building2 size={17} />
                <span><strong>{isId ? 'Perusahaan' : 'Company'}</strong><small>{isId ? 'Akun dari admin' : 'Admin-issued account'}</small></span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={accountType === 'personal'}
                className={accountType === 'personal' ? 'active' : ''}
                onClick={() => selectAccountType('personal')}
              >
                <UserRound size={17} />
                <span><strong>Personal</strong><small>{isId ? 'Akun mandiri' : 'Self-managed account'}</small></span>
              </button>
            </div>

            {accountType === 'personal' && (
              <div className="login-mode-switch" role="tablist" aria-label={isId ? 'Masuk atau daftar' : 'Sign in or register'}>
                <button type="button" role="tab" aria-selected={personalMode === 'login'} className={personalMode === 'login' ? 'active' : ''} onClick={() => selectPersonalMode('login')}>{isId ? 'Masuk' : 'Sign in'}</button>
                <button type="button" role="tab" aria-selected={personalMode === 'register'} className={personalMode === 'register' ? 'active' : ''} onClick={() => selectPersonalMode('register')}>{isId ? 'Daftar' : 'Register'}</button>
              </div>
            )}

            {error && <div className="login-error" role="alert"><ShieldAlert size={15} /> {error}</div>}
            {notice && <div className="login-notice" role="status"><Info size={16} /> {notice}</div>}

            {accountType === 'company' ? (
              <form className="login-form-centered" onSubmit={handleCompanySubmit} noValidate>
                <div className={`login-field ${usernameInvalid ? 'invalid' : ''}`}>
                  <label htmlFor="login-username">Username</label>
                  <div className="login-input-wrap">
                    <UserRound size={16} className="login-input-icon" />
                    <input id="login-username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} onBlur={() => setTouched((value) => ({ ...value, username: true }))} placeholder={isId ? 'Masukkan username Anda' : 'Enter your username'} autoComplete="username" disabled={submitting} />
                  </div>
                  {usernameInvalid && <span className="login-field-error">{isId ? 'Gunakan 3–50 karakter: huruf, angka, titik, strip, atau garis bawah.' : 'Use 3–50 letters, numbers, periods, hyphens, or underscores.'}</span>}
                </div>

                <PasswordField id="login-password" label={isId ? 'Kata sandi' : 'Password'} value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="current-password" disabled={submitting} invalid={passwordInvalid} isId={isId} />

                <button className="login-submit" type="submit" disabled={submitting}>
                  {submitting ? <><LoaderCircle size={16} className="spin" /> {isId ? 'Memverifikasi…' : 'Verifying…'}</> : (isId ? 'Masuk ke workspace' : 'Enter workspace')}
                </button>
              </form>
            ) : (
              <form className="login-form-centered" onSubmit={handlePersonalSubmit} noValidate>
                <GoogleSignInButton
                  mode={personalMode}
                  isId={isId}
                  onCredential={handleGoogleCredential}
                  onError={(message) => { setNotice(null); setError(message) }}
                />
                <div className="login-divider"><span>{isId ? 'atau gunakan email' : 'or use email'}</span></div>

                {personalMode === 'register' && (
                  <div className="login-field">
                    <label htmlFor="personal-name">{isId ? 'Nama lengkap' : 'Full name'}</label>
                    <div className="login-input-wrap">
                      <UserPlus size={16} className="login-input-icon" />
                      <input id="personal-name" type="text" value={personalName} onChange={(event) => setPersonalName(event.target.value)} placeholder={isId ? 'Masukkan nama lengkap' : 'Enter your full name'} autoComplete="name" disabled={submitting} />
                    </div>
                  </div>
                )}

                <div className="login-field">
                  <label htmlFor="personal-email">Email</label>
                  <div className="login-input-wrap">
                    <Mail size={16} className="login-input-icon" />
                    <input id="personal-email" type="email" value={personalEmail} onChange={(event) => setPersonalEmail(event.target.value)} placeholder={isId ? 'nama@email.com' : 'name@email.com'} autoComplete="email" disabled={submitting} />
                  </div>
                </div>

                <PasswordField id="personal-password" label={isId ? 'Kata sandi' : 'Password'} value={personalPassword} onChange={setPersonalPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete={personalMode === 'register' ? 'new-password' : 'current-password'} disabled={submitting} isId={isId} />

                {personalMode === 'register' && (
                  <PasswordField id="personal-confirm-password" label={isId ? 'Konfirmasi kata sandi' : 'Confirm password'} value={confirmPassword} onChange={setConfirmPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" disabled={submitting} isId={isId} />
                )}

                <button className="login-submit" type="submit" disabled={submitting}>
                  {submitting
                    ? <><LoaderCircle size={16} className="spin" /> {isId ? 'Memproses…' : 'Processing…'}</>
                    : (personalMode === 'register' ? (isId ? 'Buat akun Personal' : 'Create Personal account') : (isId ? 'Masuk sebagai Personal' : 'Sign in as Personal'))}
                </button>
                <p className="login-terms">{isId ? 'Dengan melanjutkan, Anda menyetujui ketentuan layanan dan kebijakan privasi.' : 'By continuing, you agree to the terms of service and privacy policy.'}</p>
              </form>
            )}
          </div>
        </div>

        <aside className="login-knowledge" aria-label="Knowledge workspace preview">
          <img src={loginDocuments} alt="" />
          <div className="login-visual-copy">
            <span>ENTERPRISE AI KNOWLEDGE SYSTEM</span>
            <p>{accountType === 'company'
              ? (isId ? 'Pengetahuan perusahaan, tersedia saat dibutuhkan.' : 'Company knowledge, available when it matters.')
              : (isId ? 'Workspace pribadi untuk dokumen dan pengetahuan Anda.' : 'A personal workspace for your documents and knowledge.')}</p>
          </div>
          <div className="login-visual-badge">
            {accountType === 'company' ? <Building2 size={16} /> : <UserRound size={16} />}
            {accountType === 'company' ? (isId ? 'Workspace perusahaan' : 'Company workspace') : (isId ? 'Workspace personal' : 'Personal workspace')}
          </div>
        </aside>
      </section>
    </main>
  )
}

function PasswordField({ id, label, value, onChange, show, onToggle, autoComplete, disabled = false, invalid = false, isId }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  show: boolean
  onToggle: () => void
  autoComplete: string
  disabled?: boolean
  invalid?: boolean
  isId: boolean
}) {
  return (
    <div className={`login-field ${invalid ? 'invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="login-input-wrap">
        <Lock size={16} className="login-input-icon" />
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={isId ? 'Masukkan kata sandi' : 'Enter your password'} autoComplete={autoComplete} disabled={disabled} />
        <button type="button" className="password-toggle" onClick={onToggle} tabIndex={-1} aria-label={show ? (isId ? 'Sembunyikan kata sandi' : 'Hide password') : (isId ? 'Tampilkan kata sandi' : 'Show password')}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {invalid && <span className="login-field-error">{isId ? 'Kata sandi harus minimal 6 karakter.' : 'Password must be at least 6 characters.'}</span>}
    </div>
  )
}
