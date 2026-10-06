import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Building2,
  ArrowLeft,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, errorMessage } from '@/api/client'
import { LogoMark } from '@/components/Logo'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { LOGOUT_REASON_KEY } from '@/context/authContextValue'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import loginDocuments from '@/assets/login-documents.png'

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,50}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type AccountType = 'company' | 'personal'
type PersonalMode = 'login' | 'register'
type AuthFlow = 'credentials' | 'register-code' | 'forgot-email' | 'forgot-code' | 'reset-password'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, loginWithGoogle, registerPersonal, verifyPersonalRegistration, requestPasswordReset, verifyPasswordResetCode, resetPassword: submitResetPassword } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [accountType, setAccountType] = useState<AccountType>('personal')
  const [personalMode, setPersonalMode] = useState<PersonalMode>('login')
  const [authFlow, setAuthFlow] = useState<AuthFlow>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [personalName, setPersonalName] = useState('')
  const [personalUsername, setPersonalUsername] = useState('')
  const [personalEmail, setPersonalEmail] = useState('')
  const [personalPassword, setPersonalPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(() => (
    sessionStorage.getItem(LOGOUT_REASON_KEY) === 'idle'
      ? (isId ? 'Sesi berakhir karena tidak ada aktivitas selama 20 menit. Silakan masuk kembali.' : 'Your session ended after 20 minutes of inactivity. Please sign in again.')
      : null
  ))

  // Dihapus di effect, bukan di initializer state: StrictMode memanggil
  // initializer dua kali, dan penghapusan di panggilan pertama membuat pesan
  // hilang di panggilan kedua.
  useEffect(() => { sessionStorage.removeItem(LOGOUT_REASON_KEY) }, [])
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState({ username: false, password: false })

  const companyIdentity = username.trim()
  const usernameInvalid = touched.username && companyIdentity !== '' && !USERNAME_PATTERN.test(companyIdentity) && !EMAIL_PATTERN.test(companyIdentity)
  const passwordInvalid = touched.password && password.length > 0 && password.length < 6
  const resetPasswordMinimum = accountType === 'company' ? 10 : 8

  const selectAccountType = (type: AccountType) => {
    setAccountType(type)
    setAuthFlow('credentials')
    setVerificationCode('')
    setResetEmail('')
    setResetToken('')
    setError(null)
    setNotice(null)
    setShowPassword(false)
  }

  const selectPersonalMode = (mode: PersonalMode) => {
    setPersonalMode(mode)
    setAuthFlow('credentials')
    setVerificationCode('')
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
    if (!USERNAME_PATTERN.test(companyIdentity) && !EMAIL_PATTERN.test(companyIdentity)) {
      setError(isId ? 'Masukkan username atau email yang valid.' : 'Enter a valid username or email.')
      return
    }

    setSubmitting(true)
    try {
      await login(companyIdentity.toLowerCase(), password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.message.toLowerCase().includes('trial')) {
        setError(isId ? 'Masa trial workspace ini sudah berakhir. Silakan berlangganan untuk melanjutkan.' : 'This workspace trial has expired. Subscribe to continue.')
      } else {
        setError(err instanceof ApiError && err.status === 401 ? (isId ? 'Username atau kata sandi salah.' : 'Invalid username or password.') : errorMessage(err))
      }
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

    if (!personalUsername.trim() || !personalPassword || (personalMode === 'register' && (!personalName.trim() || !personalEmail.trim()))) {
      setError(isId ? 'Lengkapi seluruh data yang wajib diisi.' : 'Complete all required fields.')
      return
    }
    const personalIdentity = personalUsername.trim()
    const validIdentity = personalMode === 'register'
      ? USERNAME_PATTERN.test(personalIdentity)
      : USERNAME_PATTERN.test(personalIdentity) || EMAIL_PATTERN.test(personalIdentity)
    if (!validIdentity) {
      setError(personalMode === 'register'
        ? (isId ? 'Username harus 3–50 karakter: huruf, angka, titik, strip, atau garis bawah.' : 'Username must use 3–50 letters, numbers, periods, hyphens, or underscores.')
        : (isId ? 'Masukkan username atau email yang valid.' : 'Enter a valid username or email.'))
      return
    }
    if (personalMode === 'register' && !EMAIL_PATTERN.test(personalEmail.trim())) {
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
        const delivery = await registerPersonal(
          personalName.trim(),
          personalUsername.trim().toLowerCase(),
          personalEmail.trim().toLowerCase(),
          personalPassword,
          confirmPassword,
        )
        setPersonalEmail(delivery.email)
        setVerificationCode('')
        setAuthFlow('register-code')
        setNotice(isId ? `Kode verifikasi telah dikirim ke ${delivery.email}.` : `A verification code was sent to ${delivery.email}.`)
        return
      } else {
        await login(personalUsername.trim().toLowerCase(), personalPassword)
      }
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(isId ? 'Username atau email ini sudah terdaftar. Silakan gunakan yang lain.' : 'This username or email is already registered. Use another one.')
      } else if (err instanceof ApiError && err.status === 401) {
        setError(isId ? 'Username atau kata sandi salah.' : 'Invalid username or password.')
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegistrationCodeSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(verificationCode)) {
      setError(isId ? 'Masukkan kode verifikasi enam digit.' : 'Enter the six-digit verification code.')
      return
    }
    setSubmitting(true)
    try {
      await verifyPersonalRegistration(personalEmail, verificationCode)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 429)) {
        setError(isId ? 'Kode salah, kedaluwarsa, atau sudah terlalu sering dicoba.' : 'The code is invalid, expired, or has been tried too many times.')
      } else if (err instanceof ApiError && err.status === 409) {
        setError(isId ? 'Username atau email ini sudah digunakan.' : 'This username or email is already in use.')
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgotEmailSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    const email = resetEmail.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(email)) {
      setError(isId ? 'Masukkan alamat email yang valid.' : 'Enter a valid email address.')
      return
    }
    setSubmitting(true)
    try {
      const delivery = await requestPasswordReset(email)
      setResetEmail(delivery.email)
      setVerificationCode('')
      setAuthFlow('forgot-code')
      setNotice(isId ? `Kode reset telah dikirim ke ${delivery.email}.` : `A reset code was sent to ${delivery.email}.`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(accountType === 'company'
          ? (isId ? 'Email tersebut tidak terdaftar sebagai akun Company.' : 'That email is not registered as a Company account.')
          : (isId ? 'Email tersebut tidak terdaftar sebagai akun Personal.' : 'That email is not registered as a Personal account.'))
      } else if (err instanceof ApiError && err.status === 429) {
        setError(isId ? 'Kode baru saja dikirim. Tunggu satu menit sebelum mencoba lagi.' : 'A code was just sent. Wait one minute before trying again.')
      } else if (err instanceof ApiError && err.status === 400) {
        setError(isId ? 'Akun ini tidak mendukung reset password melalui email.' : 'This account does not support password reset by email.')
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgotCodeSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(verificationCode)) {
      setError(isId ? 'Masukkan kode reset enam digit.' : 'Enter the six-digit reset code.')
      return
    }
    setSubmitting(true)
    try {
      const token = await verifyPasswordResetCode(resetEmail, verificationCode)
      setResetToken(token)
      setResetPassword('')
      setResetConfirmPassword('')
      setAuthFlow('reset-password')
      setNotice(isId ? 'Kode benar. Silakan buat password baru.' : 'Code verified. Create a new password.')
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 429)) {
        setError(isId ? 'Kode salah, kedaluwarsa, atau sudah terlalu sering dicoba.' : 'The code is invalid, expired, or has been tried too many times.')
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (resetPassword.length < resetPasswordMinimum) {
      setError(isId ? `Password baru minimal ${resetPasswordMinimum} karakter.` : `The new password must contain at least ${resetPasswordMinimum} characters.`)
      return
    }
    if (resetPassword !== resetConfirmPassword) {
      setError(isId ? 'Konfirmasi password baru tidak sama.' : 'The new password confirmation does not match.')
      return
    }
    setSubmitting(true)
    try {
      await submitResetPassword(resetToken, resetPassword, resetConfirmPassword)
      if (accountType === 'company') {
        setUsername(resetEmail)
        setPassword('')
      } else {
        setPersonalUsername(resetEmail)
        setPersonalPassword('')
      }
      setAuthFlow('credentials')
      setPersonalMode('login')
      setVerificationCode('')
      setResetToken('')
      setNotice(isId ? 'Password berhasil diubah. Silakan masuk menggunakan email atau username Anda.' : 'Password updated. Sign in with your email or username.')
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(isId ? 'Sesi reset tidak valid atau sudah kedaluwarsa. Minta kode baru.' : 'The reset session is invalid or expired. Request a new code.')
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
              <h1>{authFlow === 'forgot-email'
                ? (isId ? 'Lupa kata sandi' : 'Forgot password')
                : authFlow === 'forgot-code'
                  ? (isId ? 'Masukkan kode reset' : 'Enter reset code')
                  : authFlow === 'reset-password'
                    ? (isId ? 'Buat kata sandi baru' : 'Create a new password')
                    : accountType === 'company'
                      ? (isId ? 'Selamat datang kembali' : 'Welcome back')
                      : authFlow === 'register-code'
                  ? (isId ? 'Verifikasi email Anda' : 'Verify your email')
                        : (personalMode === 'login'
                            ? (isId ? 'Masuk sebagai Personal' : 'Personal sign in')
                            : (isId ? 'Buat akun Personal' : 'Create a Personal account'))}</h1>
              <p>{authFlow === 'forgot-email'
                ? (accountType === 'company'
                    ? (isId ? 'Masukkan email akun Company yang ingin dipulihkan.' : 'Enter the email of the Company account you want to recover.')
                    : (isId ? 'Masukkan email akun Personal yang ingin dipulihkan.' : 'Enter the email of the Personal account you want to recover.'))
                : authFlow === 'forgot-code'
                  ? (isId ? 'Gunakan kode enam digit yang kami kirim ke email Anda.' : 'Use the six-digit code sent to your email.')
                  : authFlow === 'reset-password'
                    ? (isId ? 'Gunakan password baru yang kuat dan mudah Anda ingat.' : 'Choose a strong new password you can remember.')
                    : accountType === 'company'
                      ? (isId ? 'Masuk menggunakan akun yang diberikan perusahaan Anda.' : 'Sign in with the account provided by your company.')
                      : authFlow === 'register-code'
                  ? (isId ? 'Periksa inbox email untuk menyelesaikan pendaftaran.' : 'Check your email inbox to finish registration.')
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

            {accountType === 'personal' && authFlow === 'credentials' && (
              <div className="login-mode-switch" role="tablist" aria-label={isId ? 'Masuk atau daftar' : 'Sign in or register'}>
                <button type="button" role="tab" aria-selected={personalMode === 'login'} className={personalMode === 'login' ? 'active' : ''} onClick={() => selectPersonalMode('login')}>{isId ? 'Masuk' : 'Sign in'}</button>
                <button type="button" role="tab" aria-selected={personalMode === 'register'} className={personalMode === 'register' ? 'active' : ''} onClick={() => selectPersonalMode('register')}>{isId ? 'Daftar' : 'Register'}</button>
              </div>
            )}

            {error && <div className="login-error" role="alert"><ShieldAlert size={15} /> {error}</div>}
            {notice && <div className="login-notice" role="status"><Info size={16} /> {notice}</div>}

            {authFlow === 'forgot-email' ? (
              <form className="login-form-centered" onSubmit={handleForgotEmailSubmit} noValidate>
                <div className="login-field">
                  <label htmlFor="forgot-account-email">Email</label>
                  <div className="login-input-wrap">
                    <Mail size={16} className="login-input-icon" />
                    <input id="forgot-account-email" type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder={isId ? 'nama@email.com' : 'name@email.com'} autoComplete="email" disabled={submitting} autoFocus />
                  </div>
                </div>
                <button className="login-submit" type="submit" disabled={submitting || !resetEmail.trim()}>
                  {submitting ? <><LoaderCircle size={16} className="spin" /> {isId ? 'Mengirim…' : 'Sending…'}</> : (isId ? 'Kirim kode reset' : 'Send reset code')}
                </button>
                <button type="button" className="login-text-action login-back-action" onClick={() => { setError(null); setNotice(null); setAuthFlow('credentials') }}>
                  <ArrowLeft size={14} /> {accountType === 'company'
                    ? (isId ? 'Kembali ke masuk Company' : 'Back to Company sign in')
                    : (isId ? 'Kembali ke masuk Personal' : 'Back to Personal sign in')}
                </button>
              </form>
            ) : authFlow === 'forgot-code' ? (
              <form className="login-form-centered" onSubmit={handleForgotCodeSubmit} noValidate>
                <CodeField value={verificationCode} onChange={setVerificationCode} disabled={submitting} isId={isId} purpose="reset" />
                <button className="login-submit" type="submit" disabled={submitting || !/^\d{6}$/.test(verificationCode)}>
                  {submitting ? <><LoaderCircle size={16} className="spin" /> {isId ? 'Memeriksa…' : 'Checking…'}</> : (isId ? 'Verifikasi kode' : 'Verify code')}
                </button>
                <button type="button" className="login-text-action login-back-action" onClick={() => { setError(null); setNotice(null); setAuthFlow('forgot-email') }}>
                  <ArrowLeft size={14} /> {isId ? 'Ganti alamat email' : 'Change email address'}
                </button>
              </form>
            ) : authFlow === 'reset-password' ? (
              <form className="login-form-centered" onSubmit={handleResetPasswordSubmit} noValidate>
                <PasswordField id="reset-account-password" label={isId ? 'Password baru' : 'New password'} value={resetPassword} onChange={setResetPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" disabled={submitting} invalid={resetPassword.length > 0 && resetPassword.length < resetPasswordMinimum} minimumLength={resetPasswordMinimum} isId={isId} />
                <PasswordField id="reset-account-confirm-password" label={isId ? 'Konfirmasi password baru' : 'Confirm new password'} value={resetConfirmPassword} onChange={setResetConfirmPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" disabled={submitting} isId={isId} />
                {resetConfirmPassword && resetPassword !== resetConfirmPassword && <span className="login-field-error">{isId ? 'Konfirmasi password baru tidak sama.' : 'The new password confirmation does not match.'}</span>}
                <button className="login-submit" type="submit" disabled={submitting || resetPassword.length < resetPasswordMinimum || resetPassword !== resetConfirmPassword}>
                  {submitting ? <><LoaderCircle size={16} className="spin" /> {isId ? 'Menyimpan…' : 'Saving…'}</> : (isId ? 'Simpan password baru' : 'Save new password')}
                </button>
              </form>
            ) : accountType === 'company' ? (
              <form className="login-form-centered" onSubmit={handleCompanySubmit} noValidate>
                <div className={`login-field ${usernameInvalid ? 'invalid' : ''}`}>
                  <label htmlFor="login-username">{isId ? 'Username atau email' : 'Username or email'}</label>
                  <div className="login-input-wrap">
                    <UserRound size={16} className="login-input-icon" />
                    <input id="login-username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} onBlur={() => setTouched((value) => ({ ...value, username: true }))} placeholder={isId ? 'Masukkan username atau email' : 'Enter your username or email'} autoComplete="username" disabled={submitting} />
                  </div>
                  {usernameInvalid && <span className="login-field-error">{isId ? 'Masukkan username atau email yang valid.' : 'Enter a valid username or email.'}</span>}
                </div>

                <PasswordField id="login-password" label={isId ? 'Kata sandi' : 'Password'} value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="current-password" disabled={submitting} invalid={passwordInvalid} isId={isId} />

                <button
                  type="button"
                  className="login-text-action login-forgot-action"
                  onClick={() => { setError(null); setNotice(null); setResetEmail(''); setAuthFlow('forgot-email') }}
                >
                  {isId ? 'Lupa kata sandi?' : 'Forgot password?'}
                </button>

                <button className="login-submit" type="submit" disabled={submitting}>
                  {submitting ? <><LoaderCircle size={16} className="spin" /> {isId ? 'Memverifikasi…' : 'Verifying…'}</> : (isId ? 'Masuk ke workspace' : 'Enter workspace')}
                </button>
                <p className="register-back-link"><Link to="/register/company">{isId ? 'Belum punya workspace? Mulai trial gratis' : 'Do not have a workspace? Start a free trial'}</Link></p>
              </form>
            ) : authFlow === 'credentials' ? (
              <form className="login-form-centered" onSubmit={handlePersonalSubmit} noValidate>
                <GoogleSignInButton
                  mode={personalMode}
                  isId={isId}
                  onCredential={handleGoogleCredential}
                  onError={(message) => { setNotice(null); setError(message) }}
                />
                <div className="login-divider"><span>{personalMode === 'register'
                  ? (isId ? 'atau daftar dengan email' : 'or register with email')
                  : (isId ? 'atau gunakan username' : 'or use your username')}</span></div>

                {personalMode === 'register' && (
                  <div className="login-field">
                    <label htmlFor="personal-name">{isId ? 'Nama lengkap' : 'Full name'}</label>
                    <div className="login-input-wrap">
                      <UserPlus size={16} className="login-input-icon" />
                      <input id="personal-name" type="text" value={personalName} onChange={(event) => setPersonalName(event.target.value)} placeholder={isId ? 'Masukkan nama lengkap' : 'Enter your full name'} autoComplete="name" disabled={submitting} />
                    </div>
                  </div>
                )}

                {personalMode === 'register' ? (
                  <>
                    <div className="login-field">
                      <label htmlFor="personal-username">Username</label>
                      <div className="login-input-wrap">
                        <UserRound size={16} className="login-input-icon" />
                        <input id="personal-username" type="text" value={personalUsername} onChange={(event) => setPersonalUsername(event.target.value)} placeholder={isId ? 'Buat username untuk login' : 'Create a username for sign in'} autoComplete="username" disabled={submitting} />
                      </div>
                    </div>
                    <div className="login-field">
                      <label htmlFor="personal-email">Email</label>
                      <div className="login-input-wrap">
                        <Mail size={16} className="login-input-icon" />
                        <input id="personal-email" type="email" value={personalEmail} onChange={(event) => setPersonalEmail(event.target.value)} placeholder={isId ? 'nama@email.com' : 'name@email.com'} autoComplete="email" disabled={submitting} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="login-field">
                    <label htmlFor="personal-username">{isId ? 'Username atau email' : 'Username or email'}</label>
                    <div className="login-input-wrap">
                      <UserRound size={16} className="login-input-icon" />
                      <input id="personal-username" type="text" value={personalUsername} onChange={(event) => setPersonalUsername(event.target.value)} placeholder={isId ? 'Masukkan username atau email' : 'Enter your username or email'} autoComplete="username" disabled={submitting} />
                    </div>
                  </div>
                )}

                <PasswordField id="personal-password" label={isId ? 'Kata sandi' : 'Password'} value={personalPassword} onChange={setPersonalPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete={personalMode === 'register' ? 'new-password' : 'current-password'} disabled={submitting} isId={isId} />

                {personalMode === 'login' && (
                  <button
                    type="button"
                    className="login-text-action login-forgot-action"
                    onClick={() => { setError(null); setNotice(null); setResetEmail(''); setAuthFlow('forgot-email') }}
                  >
                    {isId ? 'Lupa kata sandi?' : 'Forgot password?'}
                  </button>
                )}

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
            ) : (
              <form className="login-form-centered" onSubmit={handleRegistrationCodeSubmit} noValidate>
                <CodeField value={verificationCode} onChange={setVerificationCode} disabled={submitting} isId={isId} purpose="registration" />
                <button className="login-submit" type="submit" disabled={submitting || !/^\d{6}$/.test(verificationCode)}>
                  {submitting ? <><LoaderCircle size={16} className="spin" /> {isId ? 'Memverifikasi…' : 'Verifying…'}</> : (isId ? 'Verifikasi dan buat akun' : 'Verify and create account')}
                </button>
                <button type="button" className="login-text-action login-back-action" onClick={() => { setError(null); setNotice(null); setAuthFlow('credentials') }}>
                  <ArrowLeft size={14} /> {isId ? 'Kembali ke formulir pendaftaran' : 'Back to registration form'}
                </button>
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

function CodeField({ value, onChange, disabled, isId, purpose }: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  isId: boolean
  purpose: 'registration' | 'reset'
}) {
  const label = purpose === 'registration'
    ? (isId ? 'Kode verifikasi email' : 'Email verification code')
    : (isId ? 'Kode reset password' : 'Password reset code')
  return (
    <div className="login-field">
      <label htmlFor={`${purpose}-verification-code`}>{label}</label>
      <div className="login-input-wrap login-code-wrap">
        <ShieldCheck size={16} className="login-input-icon" />
        <input
          id={`${purpose}-verification-code`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          pattern="[0-9]{6}"
          maxLength={6}
          disabled={disabled}
          autoFocus
        />
      </div>
    </div>
  )
}

function PasswordField({ id, label, value, onChange, show, onToggle, autoComplete, disabled = false, invalid = false, minimumLength = 6, isId }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  show: boolean
  onToggle: () => void
  autoComplete: string
  disabled?: boolean
  invalid?: boolean
  minimumLength?: number
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
      {invalid && <span className="login-field-error">{isId ? `Kata sandi harus minimal ${minimumLength} karakter.` : `Password must be at least ${minimumLength} characters.`}</span>}
    </div>
  )
}
