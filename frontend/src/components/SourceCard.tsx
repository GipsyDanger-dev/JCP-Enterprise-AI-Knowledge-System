import { ArrowUpRight, FileText } from 'lucide-react'
import type { ReactNode } from 'react'

export function SourceCard({ title, detail, trailing }: { title: string; detail: string; trailing?: ReactNode }) {
  return (
    <div className="source-card">
      <div><FileText size={17} /><span><strong>{title}</strong><small>{detail}</small></span></div>
      {trailing ?? <button title="Open source"><ArrowUpRight size={15} /></button>}
    </div>
  )
}
