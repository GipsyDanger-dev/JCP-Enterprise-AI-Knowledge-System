import { Check } from 'lucide-react'

export function VerifiedBadge({ label = 'Evidence verified' }: { label?: string }) {
  return (
    <div className="verified">
      <span className="verified-icon"><Check size={11} strokeWidth={3} /></span>
      {label}
    </div>
  )
}
