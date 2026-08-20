import { FileText, Quote } from 'lucide-react'
import type { ReactNode } from 'react'

interface SourceCardProps {
  title: string
  detail: string
  excerpt?: string | null
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
      {trailing && <span aria-hidden="true">{trailing}</span>}
    </div>
  )
}
