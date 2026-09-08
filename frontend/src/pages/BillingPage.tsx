import { useEffect, useState } from 'react'
import { CreditCard, Pencil, Plus, RefreshCw } from 'lucide-react'
import { errorMessage } from '@/api/client'
import { createBillingPlan, createCoupon, listBillingPlans, listCoupons, listPaymentOrders, updateBillingPlan, type BillingPlan, type Coupon, type PaymentOrder } from '@/api/billing'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { PageHeading } from '@/components/PageHeading'

export function BillingPage() {
  const { token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const refresh = async () => {
    if (!token) return
    const [nextPlans, nextOrders, nextCoupons] = await Promise.all([listBillingPlans(), listPaymentOrders(token), listCoupons(token)])
    setPlans(nextPlans); setOrders(nextOrders); setCoupons(nextCoupons)
  }
  const createCouponCode = async () => {
    const code = window.prompt(isId ? 'Kode kupon' : 'Coupon code', 'WELCOME10')
    if (!code) return
    const requestedType = (window.prompt(isId ? 'Tipe diskon: PERCENT atau FIXED' : 'Discount type: PERCENT or FIXED', 'PERCENT') ?? 'PERCENT').trim().toUpperCase()
    const discountType = requestedType === 'FIXED' ? 'FIXED' : requestedType === 'PERCENT' ? 'PERCENT' : ''
    if (!discountType) return
    const value = Number(window.prompt(discountType === 'FIXED' ? (isId ? 'Diskon nominal (IDR)' : 'Fixed discount (IDR)') : (isId ? 'Diskon persen' : 'Discount percent'), discountType === 'FIXED' ? '50000' : '10'))
    if (!Number.isFinite(value) || value < 1 || (discountType === 'PERCENT' && value > 100)) return
    setSaving(true); setError('')
    try { await createCoupon(token ?? '', { code, discountType, value }); await refresh() }
    catch (err) { setError(errorMessage(err)) } finally { setSaving(false) }
  }
  useEffect(() => { refresh().catch((err) => setError(errorMessage(err))) }, [token])
  const createPlan = async () => {
    const name = window.prompt(isId ? 'Nama paket' : 'Plan name', 'Business')
    if (!name) return
    const monthly = Number(window.prompt(isId ? 'Harga bulanan (IDR)' : 'Monthly price (IDR)', '199000'))
    const yearly = Number(window.prompt(isId ? 'Harga tahunan (IDR)' : 'Yearly price (IDR)', '1990000'))
    if (!Number.isFinite(monthly) || !Number.isFinite(yearly)) return
    setSaving(true); setError('')
    try { await createBillingPlan(token ?? '', { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, description: '', monthlyAmount: monthly, yearlyAmount: yearly, maxMembers: 100 }); await refresh() }
    catch (err) { setError(errorMessage(err)) } finally { setSaving(false) }
  }
  const editPlan = async (plan: BillingPlan) => {
    const monthly = Number(window.prompt(isId ? 'Harga bulanan baru (IDR)' : 'New monthly price (IDR)', String(plan.monthlyAmount)))
    const yearly = Number(window.prompt(isId ? 'Harga tahunan baru (IDR)' : 'New yearly price (IDR)', String(plan.yearlyAmount)))
    if (!Number.isFinite(monthly) || !Number.isFinite(yearly)) return
    setSaving(true); setError('')
    try { await updateBillingPlan(token ?? '', plan.id, { monthlyAmount: monthly, yearlyAmount: yearly }); await refresh() }
    catch (err) { setError(errorMessage(err)) } finally { setSaving(false) }
  }
  return <div className="standard-page">
    <PageHeading eyebrow={isId ? 'Billing platform' : 'Platform billing'} title={isId ? 'Paket & pembayaran' : 'Plans & payments'} detail={isId ? 'Kelola paket sandbox SumoPod dan pantau order.' : 'Manage SumoPod sandbox plans and payment orders.'} action={<button className="primary-button" onClick={createPlan} disabled={saving}><Plus size={16} />{isId ? 'Buat paket' : 'Create plan'}</button>} />
    {error && <p className="inline-alert" role="alert">{error}</p>}
    <section className="settings-section"><div className="settings-section-header"><CreditCard size={18} /><div><h3>{isId ? 'Paket aktif' : 'Active plans'}</h3><small>{isId ? 'Harga dapat disesuaikan melalui Maintainer.' : 'Pricing is managed by the Maintainer.'}</small></div><button className="icon-button" title={isId ? 'Muat ulang' : 'Refresh'} onClick={() => refresh().catch((err) => setError(errorMessage(err)))}><RefreshCw size={16} /></button></div>
      <div className="data-table"><table><thead><tr><th>{isId ? 'Paket' : 'Plan'}</th><th>{isId ? 'Bulanan' : 'Monthly'}</th><th>{isId ? 'Tahunan' : 'Yearly'}</th><th>{isId ? 'Maks anggota' : 'Max members'}</th><th></th></tr></thead><tbody>{plans.map((plan) => <tr key={plan.id}><td><strong>{plan.name}</strong><span className="member-subtext">{plan.slug}</span></td><td>Rp {plan.monthlyAmount.toLocaleString('id-ID')}</td><td>Rp {plan.yearlyAmount.toLocaleString('id-ID')}</td><td>{plan.maxMembers ?? '-'}</td><td><button className="icon-button" title={isId ? 'Edit paket' : 'Edit plan'} onClick={() => editPlan(plan)}><Pencil size={15} /></button></td></tr>)}{!plans.length && <tr><td colSpan={5}>{isId ? 'Belum ada paket.' : 'No plans yet.'}</td></tr>}</tbody></table></div>
    </section>
    <section className="settings-section"><div className="settings-section-header"><CreditCard size={18} /><div><h3>{isId ? 'Order pembayaran' : 'Payment orders'}</h3><small>{isId ? 'Transaksi sandbox tidak memindahkan uang nyata.' : 'Sandbox transactions never move real money.'}</small></div></div>
      <div className="data-table"><table><thead><tr><th>Order</th><th>{isId ? 'Workspace' : 'Workspace'}</th><th>{isId ? 'Jumlah' : 'Amount'}</th><th>Status</th><th>{isId ? 'Dibuat' : 'Created'}</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td>{order.orderId}</td><td>{order.workspace?.name ?? '-'}</td><td>Rp {order.totalAmount.toLocaleString('id-ID')}</td><td><span className={`role-badge ${order.status === 'PAID' ? 'admin' : 'user'}`}>{order.status}</span></td><td>{new Date(order.expiresAt).toLocaleDateString('id-ID')}</td></tr>)}{!orders.length && <tr><td colSpan={5}>{isId ? 'Belum ada order.' : 'No payment orders yet.'}</td></tr>}</tbody></table></div>
    </section>
    <section className="settings-section"><div className="settings-section-header"><CreditCard size={18} /><div><h3>{isId ? 'Kupon' : 'Coupons'}</h3><small>{isId ? 'Diskon digunakan saat checkout perusahaan.' : 'Discounts can be applied during company checkout.'}</small></div><button className="secondary-button" onClick={createCouponCode} disabled={saving}><Plus size={15} />{isId ? 'Buat kupon' : 'Create coupon'}</button></div>
      <div className="data-table"><table><thead><tr><th>Code</th><th>{isId ? 'Diskon' : 'Discount'}</th><th>{isId ? 'Terpakai' : 'Redeemed'}</th><th>Status</th></tr></thead><tbody>{coupons.map((coupon) => <tr key={coupon.id}><td>{coupon.code}</td><td>{coupon.discountType === 'PERCENT' ? `${coupon.value}%` : `Rp ${coupon.value.toLocaleString('id-ID')}`}</td><td>{coupon.redemptionCount}{coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''}</td><td>{coupon.isActive ? (isId ? 'Aktif' : 'Active') : (isId ? 'Nonaktif' : 'Inactive')}</td></tr>)}{!coupons.length && <tr><td colSpan={4}>{isId ? 'Belum ada kupon.' : 'No coupons yet.'}</td></tr>}</tbody></table></div>
    </section>
  </div>
}
