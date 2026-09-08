import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Building2, Check, Clock3, CreditCard, Eye, EyeOff, LoaderCircle, Lock, Mail, ShieldAlert, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, errorMessage } from '@/api/client'
import { checkCompanyAvailability } from '@/api/auth'
import { LogoMark } from '@/components/Logo'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import loginDocuments from '@/assets/login-documents.png'

type OnboardingMode = 'TRIAL' | 'SUBSCRIBE'

export function CompanyRegisterPage() {
  const navigate = useNavigate()
  const { registerCompany } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [organizationName, setOrganizationName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>('TRIAL')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    const requiredFields = [
      ['organizationName', organizationName, isId ? 'Nama organisasi wajib diisi.' : 'Organization name is required.'],
      ['adminName', adminName, isId ? 'Nama admin wajib diisi.' : 'Admin name is required.'],
      ['adminUsername', adminUsername, isId ? 'Username admin wajib diisi.' : 'Admin username is required.'],
      ['adminEmail', adminEmail, isId ? 'Email admin wajib diisi.' : 'Admin email is required.'],
      ['password', password, isId ? 'Kata sandi wajib diisi.' : 'Password is required.'],
    ] as const
    const missing = Object.fromEntries(requiredFields.filter(([, value]) => !value.trim()).map(([key, , message]) => [key, message]))
    if (Object.keys(missing).length) {
      setFieldErrors(missing)
      return
    }
    const localErrors: Record<string, string> = {}
    if (organizationName.trim().length < 2) localErrors.organizationName = isId ? 'Nama organisasi minimal 2 karakter.' : 'Organization name must be at least 2 characters.'
    if (adminName.trim().length < 2) localErrors.adminName = isId ? 'Nama admin minimal 2 karakter.' : 'Admin name must be at least 2 characters.'
    if (adminUsername.trim().length < 3) localErrors.adminUsername = isId ? 'Username admin minimal 3 karakter.' : 'Admin username must be at least 3 characters.'
    if (adminUsername.trim().length >= 3 && !/^[a-zA-Z0-9_.-]+$/.test(adminUsername.trim())) localErrors.adminUsername = isId ? 'Username admin hanya boleh berisi huruf, angka, titik, garis bawah, atau strip.' : 'Use only letters, numbers, periods, underscores, or hyphens.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) localErrors.adminEmail = isId ? 'Masukkan email admin yang valid.' : 'Enter a valid admin email.'
    if (password.length < 10) localErrors.password = isId ? 'Kata sandi minimal 10 karakter.' : 'Password must be at least 10 characters.'
    if (confirmPassword.length < 10) localErrors.confirmPassword = isId ? 'Konfirmasi kata sandi minimal 10 karakter.' : 'Confirmation must be at least 10 characters.'
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors)
      return
    }
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: isId ? 'Konfirmasi kata sandi tidak sama.' : 'Password confirmation does not match.' })
      return
    }
    const draft = { organizationName, adminName, adminUsername, adminEmail, password, confirmPassword, onboardingMode: 'SUBSCRIBE' as const }
    setSubmitting(true)
    try {
      const availability = await checkCompanyAvailability(adminUsername, adminEmail)
      const availabilityErrors: Record<string, string> = {}
      if (!availability.usernameAvailable) availabilityErrors.adminUsername = isId ? 'Username admin sudah digunakan.' : 'This admin username is already in use.'
      if (!availability.emailAvailable) availabilityErrors.adminEmail = isId ? 'Email admin sudah digunakan.' : 'This admin email is already in use.'
      if (Object.keys(availabilityErrors).length) {
        setFieldErrors(availabilityErrors)
        return
      }

      if (onboardingMode === 'SUBSCRIBE') {
        navigate('/register/company/pricing', { state: { draft } })
        return
      }

      await registerCompany({ ...draft, onboardingMode: 'TRIAL' })
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError(isId ? 'Pembayaran online belum tersedia. Pilih trial gratis untuk mulai sekarang.' : 'Online payment is not available yet. Choose the free trial to start now.')
      } else if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({
          adminUsername: isId ? 'Username admin sudah digunakan.' : 'This admin username is already in use.',
          adminEmail: isId ? 'Email admin sudah digunakan.' : 'This admin email is already in use.',
        })
      } else if (err instanceof ApiError && err.status === 400) {
        const message = err.message.toLowerCase()
        const mapped: Record<string, string> = {}
        if (message.includes('organizationname')) mapped.organizationName = isId ? 'Nama organisasi minimal 2 karakter.' : 'Organization name must be at least 2 characters.'
        if (message.includes('adminname')) mapped.adminName = isId ? 'Nama admin minimal 2 karakter.' : 'Admin name must be at least 2 characters.'
        if (message.includes('adminusername')) mapped.adminUsername = isId ? 'Username admin harus 3–80 karakter dan hanya memakai huruf, angka, titik, garis bawah, atau strip.' : 'Use 3–80 letters, numbers, periods, underscores, or hyphens.'
        if (message.includes('adminemail')) mapped.adminEmail = isId ? 'Masukkan email admin yang valid.' : 'Enter a valid admin email.'
        if (message.includes('password')) mapped.password = isId ? 'Kata sandi minimal 10 karakter.' : 'Password must be at least 10 characters.'
        if (message.includes('confirmpassword')) mapped.confirmPassword = isId ? 'Konfirmasi kata sandi tidak sama.' : 'Password confirmation does not match.'
        setFieldErrors(Object.keys(mapped).length ? mapped : { organizationName: errorMessage(err) })
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-centered">
      <section className="login-workspace" aria-label={isId ? 'Pendaftaran workspace perusahaan' : 'Company workspace registration'}>
        <div className="login-panel">
          <div className="login-form-shell register-company-shell">
            <div className="login-brand"><LogoMark size={28} /><span>Enterprise AI</span></div>
            <div className="login-card-header">
              <h1>{isId ? 'Buat workspace perusahaan' : 'Create a company workspace'}</h1>
              <p>{isId ? 'Mulai demo tanpa menunggu persetujuan.' : 'Start a workspace without waiting for approval.'}</p>
            </div>

            {error && <div className="login-error" role="alert"><ShieldAlert size={15} /> {error}</div>}

            <div className="onboarding-choice-grid" role="radiogroup" aria-label={isId ? 'Pilih cara mulai' : 'Choose how to start'}>
              <button type="button" className={onboardingMode === 'TRIAL' ? 'active' : ''} onClick={() => setOnboardingMode('TRIAL')}>
                <Clock3 size={18} /><span><strong>{isId ? 'Trial gratis' : 'Free trial'}</strong><small>{isId ? 'Akses langsung selama masa trial' : 'Immediate access during trial'}</small></span>
                {onboardingMode === 'TRIAL' && <Check size={15} />}
              </button>
              <button type="button" className={onboardingMode === 'SUBSCRIBE' ? 'active' : ''} onClick={() => setOnboardingMode('SUBSCRIBE')}>
                <CreditCard size={18} /><span><strong>{isId ? 'Berlangganan' : 'Subscribe now'}</strong><small>{isId ? 'Siapkan checkout pembayaran' : 'Set up payment checkout'}</small></span>
                {onboardingMode === 'SUBSCRIBE' && <Check size={15} />}
              </button>
            </div>

            <form className="login-form-centered" onSubmit={submit} noValidate>
              <div className={`login-field ${fieldErrors.organizationName ? 'invalid' : ''}`}><label htmlFor="company-organization">{isId ? 'Nama organisasi' : 'Organization name'}</label><div className="login-input-wrap"><Building2 size={16} className="login-input-icon" /><input id="company-organization" value={organizationName} onChange={(event) => { setOrganizationName(event.target.value); setFieldErrors((current) => ({ ...current, organizationName: '' })) }} required disabled={submitting} /></div>{fieldErrors.organizationName && <span className="login-field-error">{fieldErrors.organizationName}</span>}</div>
              <div className="register-two-col">
                <Field label={isId ? 'Nama admin' : 'Admin name'} id="company-admin-name" value={adminName} error={fieldErrors.adminName} icon={<UserRound size={16} />} onChange={(value) => { setAdminName(value); setFieldErrors((current) => ({ ...current, adminName: '' })) }} disabled={submitting} />
                <Field label="Username admin" id="company-admin-username" value={adminUsername} error={fieldErrors.adminUsername} icon={<UserRound size={16} />} onChange={(value) => { setAdminUsername(value); setFieldErrors((current) => ({ ...current, adminUsername: '' })) }} disabled={submitting} autoComplete="username" />
              </div>
              <Field label="Email admin" id="company-admin-email" type="email" value={adminEmail} error={fieldErrors.adminEmail} icon={<Mail size={16} />} onChange={(value) => { setAdminEmail(value); setFieldErrors((current) => ({ ...current, adminEmail: '' })) }} disabled={submitting} autoComplete="email" />
              <div className="register-two-col">
                <PasswordField id="company-password" label={isId ? 'Kata sandi' : 'Password'} value={password} error={fieldErrors.password} onChange={(value) => { setPassword(value); setFieldErrors((current) => ({ ...current, password: '' })) }} show={showPassword} onToggle={() => setShowPassword((value) => !value)} disabled={submitting} isId={isId} />
                <PasswordField id="company-confirm-password" label={isId ? 'Konfirmasi' : 'Confirm'} value={confirmPassword} error={fieldErrors.confirmPassword} onChange={(value) => { setConfirmPassword(value); setFieldErrors((current) => ({ ...current, confirmPassword: '' })) }} show={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} disabled={submitting} isId={isId} />
              </div>
              <button className="login-submit" type="submit" disabled={submitting}>{submitting ? <><LoaderCircle size={16} className="spin" /> {isId ? 'Menyiapkan workspace…' : 'Setting up workspace…'}</> : (onboardingMode === 'TRIAL' ? (isId ? 'Mulai trial gratis' : 'Start free trial') : (isId ? 'Lanjut ke pilih paket' : 'Continue to plans'))}</button>
              <p className="login-terms"><Lock size={12} /> {isId ? 'Admin dapat mengundang pegawai setelah workspace dibuat.' : 'The admin can invite employees after setup.'}</p>
            </form>
            <p className="register-back-link"><Link to="/login">{isId ? 'Sudah punya akun? Masuk' : 'Already have an account? Sign in'}</Link></p>
          </div>
        </div>
        <aside className="login-knowledge" aria-hidden="true"><img src={loginDocuments} alt="" /><div className="login-visual-copy"><span>ENTERPRISE AI KNOWLEDGE SYSTEM</span><p>{isId ? 'Bangun ruang pengetahuan perusahaan Anda.' : 'Build your company knowledge workspace.'}</p></div></aside>
      </section>
    </main>
  )
}

function Field({ label, id, value, error, icon, onChange, disabled, type = 'text', autoComplete = 'off' }: { label: string; id: string; value: string; error?: string; icon: ReactNode; onChange: (value: string) => void; disabled: boolean; type?: string; autoComplete?: string }) {
  return <div className={`login-field ${error ? 'invalid' : ''}`}><label htmlFor={id}>{label}</label><div className="login-input-wrap"><span className="login-input-icon">{icon}</span><input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} required disabled={disabled} autoComplete={autoComplete} /></div>{error && <span className="login-field-error">{error}</span>}</div>
}

function PasswordField({ id, label, value, error, onChange, show, onToggle, disabled, isId }: { id: string; label: string; value: string; error?: string; onChange: (value: string) => void; show: boolean; onToggle: () => void; disabled: boolean; isId: boolean }) {
  return <div className={`login-field ${error ? 'invalid' : ''}`}><label htmlFor={id}>{label}</label><div className="login-input-wrap"><Lock size={16} className="login-input-icon" /><input id={id} type={show ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} minLength={10} required autoComplete="new-password" disabled={disabled} /><button type="button" className="password-toggle" onClick={onToggle} aria-label={show ? (isId ? 'Sembunyikan kata sandi' : 'Hide password') : (isId ? 'Tampilkan kata sandi' : 'Show password')}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>{error && <span className="login-field-error">{error}</span>}</div>
}
