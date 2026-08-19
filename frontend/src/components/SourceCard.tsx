import { ArrowUpRight, FileText, Quote } from 'lucide-react'
import type { ReactNode } from 'react'

interface SourceCardProps {
  title: string
  detail: string
  excerpt?: string
  trailing?: ReactNode
}

export function SourceCard({ title, detail, excerpt, trailing }: SourceCardProps) {
  return (
    <div className="source-card">
      <div>
        <div className="source-card-header">
          <FileText size={17} />
          <span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
        </div>
        {excerpt && (
          <div className="source-card-excerpt">
            <Quote size={12} />
            <p>{excerpt}</p>
          </div>
        )}
      </div>
      {trailing ?? <button title="Open source"><ArrowUpRight size={15} /></button>}
    </div>
  )
}
