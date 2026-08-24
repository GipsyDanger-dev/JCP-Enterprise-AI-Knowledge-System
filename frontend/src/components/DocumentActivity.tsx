import { ArrowUpRight, FileText } from 'lucide-react'
import type { DocumentItem } from '@/types/domain'
import { StatusBadge } from './StatusBadge'

export function DocumentActivity({ document, onOpen }: { document: DocumentItem; onOpen?: () => void }) {
  return (
    <div className="activity-row">
      <span className="file-icon"><FileText size={18} /></span>
      <div><strong>{document.name}</strong><small>{document.collection} · {document.updatedAt}</small></div>
      <StatusBadge status={document.status} />
      <button className="icon-button" title={`Open ${document.name}`} onClick={onOpen}><ArrowUpRight size={16} /></button>
    </div>
  )
}
