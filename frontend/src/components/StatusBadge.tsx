import { Check, Clock3, LoaderCircle } from 'lucide-react'
import type { DocumentStatus } from '@/types/domain'

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`status-badge ${status.toLowerCase()}`}>
      {status === 'Ready' ? <Check size={12} /> : status === 'Processing' ? <LoaderCircle size={12} /> : <Clock3 size={12} />}
      {status}
    </span>
  )
}
