import { FileText } from 'lucide-react'
import type { DocumentItem } from '@/types/domain'
import { StatusBadge } from './StatusBadge'

export function DocumentActivity({ document }: { document: DocumentItem }) {
  return (
    <div className="activity-row">
      <span className="file-icon"><FileText size={18} /></span>
      <div><strong>{document.name}</strong><small>{document.updatedAt || 'Timestamp unavailable'}</small></div>
      <StatusBadge status={document.status} />
    </div>
  )
}
