import { authHeaders, request } from './client'

export interface BillingPlan {
  id: string
  slug: string
  name: string
  description?: string | null
  monthlyAmount: number
  yearlyAmount: number
  maxMembers?: number | null
  isActive: boolean
}

export interface PaymentOrder {
  id: string
  orderId: string
  providerPaymentId?: string | null
  paymentUrl?: string | null
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED'
  cycle: 'MONTHLY' | 'YEARLY'
  subtotal: number
  discountAmount: number
  totalAmount: number
  providerFee?: number | null
  providerNetAmount?: number | null
  currency: string
  expiresAt: string
  paidAt?: string | null
  plan?: BillingPlan
  workspace?: { id: string; name: string }
}

export interface Coupon { id: string; code: string; discountType: 'PERCENT' | 'FIXED'; value: number; startsAt?: string | null; endsAt?: string | null; maxRedemptions?: number | null; redemptionCount: number; isActive: boolean }

export function listBillingPlans(): Promise<BillingPlan[]> { return request<BillingPlan[]>('/billing/plans') }
export function createPaymentOrder(token: string, input: { planSlug: string; cycle: 'MONTHLY' | 'YEARLY'; couponCode?: string }): Promise<PaymentOrder> { return request<PaymentOrder>('/billing/orders', { method: 'POST', headers: authHeaders(token), body: input }) }
export function getPaymentOrder(token: string, id: string): Promise<PaymentOrder> { return request<PaymentOrder>(`/billing/orders/${id}`, { headers: authHeaders(token) }) }
export function getPublicPaymentOrder(id: string): Promise<PaymentOrder> { return request<PaymentOrder>(`/billing/public/orders/${id}`) }
export function listPaymentOrders(token: string): Promise<PaymentOrder[]> { return request<PaymentOrder[]>('/billing/orders', { headers: authHeaders(token) }) }
export function createBillingPlan(token: string, input: Omit<BillingPlan, 'id' | 'isActive'> & { isActive?: boolean }): Promise<BillingPlan> { return request<BillingPlan>('/billing/plans', { method: 'POST', headers: authHeaders(token), body: input }) }
export function updateBillingPlan(token: string, id: string, input: Partial<BillingPlan>): Promise<BillingPlan> { return request<BillingPlan>(`/billing/plans/${id}`, { method: 'PATCH', headers: authHeaders(token), body: input }) }
export function listCoupons(token: string): Promise<Coupon[]> { return request<Coupon[]>('/billing/coupons', { headers: authHeaders(token) }) }
export function createCoupon(token: string, input: { code: string; discountType: 'PERCENT' | 'FIXED'; value: number; maxRedemptions?: number }): Promise<Coupon> { return request<Coupon>('/billing/coupons', { method: 'POST', headers: authHeaders(token), body: input }) }
