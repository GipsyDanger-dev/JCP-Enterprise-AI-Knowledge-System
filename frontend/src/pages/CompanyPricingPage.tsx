import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Clock3, CreditCard, LoaderCircle, Mail, ShieldAlert, ShieldCheck, Tag, Users } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, errorMessage } from '@/api/client'
import type { CompanyRegisterRequest } from '@/api/types'
import { listBillingPlans, type BillingPlan } from '@/api/billing'
import { LogoMark } from '@/components/Logo'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

type RegistrationDraft = Omit<CompanyRegisterRequest, 'onboardingMode' | 'planSlug' | 'cycle' | 'couponCode'>
type PricingLocationState = { draft?: RegistrationDraft }

export function CompanyPricingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { registerCompany, verifyCompanyRegistration } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const draft = (location.state as PricingLocationState | null)?.draft
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [selectedSlug, setSelectedSlug] = useState('')
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY')
  const [couponCode, setCouponCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [verificationPending, setVerificationPending] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')

  useEffect(() => {
    if (!draft) return
    listBillingPlans().then((items) => {
      setPlans(items)
      if (items[0]) setSelectedSlug(items[0].slug)
    }).catch((err) => setError(errorMessage(err))).finally(() => setLoading(false))
  }, [draft])

  const selectedPlan = useMemo(() => plans.find((plan) => plan.slug === selectedSlug) ?? plans[0], [plans, selectedSlug])
  const amount = selectedPlan ? (cycle === 'MONTHLY' ? selectedPlan.monthlyAmount : selectedPlan.yearlyAmount) : 0

  const submit = async () => {
    if (!draft || !selectedPlan) return
    setSubmitting(true)
    setError('')
    try {
      const response = await registerCompany({ ...draft, onboardingMode: 'SUBSCRIBE', planSlug: selectedPlan.slug, cycle, couponCode: couponCode.trim() || undefined })
      setVerificationEmail(response.email)
      setVerificationCode('')
      setVerificationPending(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError(isId ? 'Pembayaran sandbox belum siap. Periksa konfigurasi provider pembayaran.' : 'Sandbox payment is not configured. Check the payment provider configuration.')
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const verifyAndCheckout = async () => {
    if (!/^\d{6}$/.test(verificationCode)) return
    setSubmitting(true)
    setError('')
    try {
      const response = await verifyCompanyRegistration(verificationEmail, verificationCode)
      if ('paymentUrl' in response && response.paymentUrl) {
        window.location.assign(response.paymentUrl)
      } else if ('orderId' in response) {
        navigate(`/billing/return?status=pending&orderId=${encodeURIComponent(response.orderId)}`, { replace: true })
      } else {
        navigate('/', { replace: true })
      }
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

  if (!draft) {
    return <main className="pricing-centered"><section className="pricing-empty"><ShieldAlert size={28} /><h1>{isId ? 'Data registrasi tidak ditemukan' : 'Registration data not found'}</h1><p>{isId ? 'Mulai kembali dari halaman registrasi perusahaan.' : 'Start again from company registration.'}</p><Link className="primary-button" to="/register/company">{isId ? 'Kembali ke registrasi' : 'Back to registration'}</Link></section></main>
  }

  if (verificationPending) {
    return <main className="pricing-centered"><section className="pricing-empty">
      <ShieldCheck size={28} />
      <h1>{isId ? 'Verifikasi email sebelum checkout' : 'Verify your email before checkout'}</h1>
      <p><Mail size={15} /> {isId ? `Kode enam digit telah dikirim ke ${verificationEmail}.` : `A six-digit code was sent to ${verificationEmail}.`}</p>
      {error && <div className="login-error" role="alert"><ShieldAlert size={15} />{error}</div>}
      <div className="login-input-wrap login-code-wrap"><ShieldCheck size={16} className="login-input-icon" /><input aria-label={isId ? 'Kode verifikasi email' : 'Email verification code'} type="text" inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} disabled={submitting} autoFocus /></div>
      <button className="primary-button" type="button" onClick={verifyAndCheckout} disabled={submitting || !/^\d{6}$/.test(verificationCode)}>{submitting ? (isId ? 'Memverifikasi…' : 'Verifying…') : (isId ? 'Verifikasi dan lanjut bayar' : 'Verify and continue to payment')}</button>
      <button className="login-text-action login-back-action" type="button" onClick={() => { setVerificationPending(false); setVerificationCode(''); setError('') }}><ArrowLeft size={14} />{isId ? 'Kembali ke pilihan paket' : 'Back to plan selection'}</button>
    </section></main>
  }

  return <main className="pricing-centered">
    <div className="pricing-shell">
      <header className="pricing-header">
        <Link className="pricing-back-link" to="/register/company" state={{ draft }}><ArrowLeft size={16} />{isId ? 'Kembali ke data workspace' : 'Back to workspace details'}</Link>
        <div className="pricing-brand"><LogoMark size={28} /><span>Enterprise AI</span></div>
        <span className="pricing-eyebrow">{isId ? 'PILIH PAKET' : 'CHOOSE A PLAN'}</span>
        <h1>{isId ? 'Pilih paket untuk workspace Anda' : 'Choose a plan for your workspace'}</h1>
        <p>{isId ? `Workspace ${draft.organizationName} siap disiapkan. Pilih paket dan siklus pembayaran sebelum checkout.` : `Workspace ${draft.organizationName} is ready. Choose a plan and billing cycle before checkout.`}</p>
      </header>

      <div className="pricing-toolbar">
        <div><strong>{isId ? 'Siklus pembayaran' : 'Billing cycle'}</strong><small>{isId ? 'Pembayaran diperbarui manual melalui invoice baru.' : 'Renewals are manual through a new invoice.'}</small></div>
        <div className="pricing-cycle" role="group" aria-label={isId ? 'Siklus pembayaran' : 'Billing cycle'}>
          <button type="button" className={cycle === 'MONTHLY' ? 'active' : ''} onClick={() => setCycle('MONTHLY')}><Clock3 size={15} />{isId ? 'Bulanan' : 'Monthly'}</button>
          <button type="button" className={cycle === 'YEARLY' ? 'active' : ''} onClick={() => setCycle('YEARLY')}><CreditCard size={15} />{isId ? 'Tahunan' : 'Yearly'}</button>
        </div>
      </div>

      {error && <div className="login-error pricing-error" role="alert"><ShieldAlert size={15} />{error}</div>}
      {loading ? <div className="pricing-loading"><LoaderCircle size={20} className="spin" />{isId ? 'Memuat paket…' : 'Loading plans…'}</div> : <>
        <div className={`pricing-grid ${plans.length === 1 ? 'single' : ''}`}>
          {plans.map((plan, index) => {
            const active = selectedPlan?.slug === plan.slug
            const price = cycle === 'MONTHLY' ? plan.monthlyAmount : plan.yearlyAmount
            return <article className={`pricing-card ${active ? 'active' : ''}`} key={plan.id}>
              {index === 0 && <span className="pricing-card-label">{isId ? 'MULAI DI SINI' : 'START HERE'}</span>}
              <div className="pricing-card-heading"><h2>{plan.name}</h2>{active && <Check size={17} />}</div>
              <p className="pricing-card-description">{plan.description || (isId ? 'Ruang kerja pengetahuan untuk tim Anda.' : 'A knowledge workspace for your team.')}</p>
              <div className="pricing-price"><strong>Rp {price.toLocaleString('id-ID')}</strong><span>/{cycle === 'MONTHLY' ? (isId ? 'bulan' : 'month') : (isId ? 'tahun' : 'year')}</span></div>
              <div className="pricing-limit"><Users size={15} />{plan.maxMembers ? `${isId ? 'Hingga' : 'Up to'} ${plan.maxMembers} ${isId ? 'anggota' : 'members'}` : (isId ? 'Anggota tidak terbatas' : 'Unlimited members')}</div>
              <ul><li><Check size={14} />{isId ? 'Dokumen dan jawaban AI ter-grounding' : 'Grounded documents and AI answers'}</li><li><Check size={14} />{isId ? 'Workspace perusahaan' : 'Company workspace'}</li><li><Check size={14} />{isId ? 'Dukungan onboarding' : 'Onboarding support'}</li></ul>
              <button type="button" className={active ? 'pricing-select active' : 'pricing-select'} onClick={() => setSelectedSlug(plan.slug)}>{active ? (isId ? 'Paket dipilih' : 'Selected plan') : (isId ? 'Pilih paket' : 'Choose plan')}</button>
            </article>
          })}
        </div>

        <section className="pricing-checkout-bar">
          <div className="pricing-checkout-summary"><span>{isId ? 'Ringkasan pilihan' : 'Selection summary'}</span><strong>{selectedPlan?.name ?? '-'} · Rp {amount.toLocaleString('id-ID')} / {cycle === 'MONTHLY' ? (isId ? 'bulan' : 'month') : (isId ? 'tahun' : 'year')}</strong><small><Tag size={14} />{isId ? 'Kode kupon opsional' : 'Optional coupon code'}</small></div>
          <div className="pricing-checkout-actions"><input aria-label={isId ? 'Kode kupon' : 'Coupon code'} value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder={isId ? 'Masukkan kupon' : 'Enter coupon'} disabled={submitting} /><button className="login-submit" type="button" onClick={submit} disabled={submitting || !selectedPlan}>{submitting ? <><LoaderCircle size={16} className="spin" />{isId ? 'Menyiapkan checkout…' : 'Preparing checkout…'}</> : <><CreditCard size={16} />{isId ? 'Lanjut ke pembayaran' : 'Continue to payment'}</>}</button></div>
        </section>
      </>}
    </div>
  </main>
}
