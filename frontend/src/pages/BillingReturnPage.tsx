import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock3, ShieldAlert } from 'lucide-react'
import { getPublicPaymentOrder, type PaymentOrder } from '@/api/billing'

export function BillingReturnPage() {
  const [params] = useSearchParams()
  const orderId = params.get('orderId') ?? ''
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    let timer: number | undefined
    const load = async () => {
      try {
        const next = await getPublicPaymentOrder(orderId)
        if (cancelled) return
        setOrder(next)
        if (next.status === 'PENDING') timer = window.setTimeout(load, 4000)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Payment status unavailable')
      }
    }
    void load()
    return () => { cancelled = true; if (timer) window.clearTimeout(timer) }
  }, [orderId])

  const status = order?.status
  const title = status === 'PAID' ? 'Pembayaran berhasil' : status === 'FAILED' ? 'Pembayaran gagal' : status === 'EXPIRED' ? 'Payment link kedaluwarsa' : 'Menunggu pembayaran'
  const detail = status === 'PAID' ? 'Workspace Anda sudah aktif. Silakan masuk menggunakan akun admin.' : status === 'PENDING' ? 'Selesaikan pembayaran di SumoPod. Status akan diperbarui otomatis.' : 'Buat payment link baru atau hubungi Maintainer untuk bantuan.'
  return <main className="login-centered"><section className="billing-return-card">
    {status === 'PAID' ? <CheckCircle2 size={34} /> : status === 'FAILED' || status === 'EXPIRED' ? <ShieldAlert size={34} /> : <Clock3 size={34} />}
    <h1>{title}</h1><p>{error || detail}</p>
    {order && <p className="billing-order-reference">Order {order.orderId} · Rp {order.totalAmount.toLocaleString('id-ID')}</p>}
    <Link className="primary-button" to="/login">Ke halaman masuk</Link>
  </section></main>
}
