import { ArrowUpRight, FileText, Quote } from 'lucide-react'
import type { ReactNode } from 'react'

interface SourceCardProps {
  title: string
  detail: string
  excerpt?: string
  trailing?: ReactNode
  onOpen?: () => void
}

export function SourceCard({ title, detail, excerpt, trailing, onOpen }: SourceCardProps) {
  return (
    <button type="button" className="source-card" onClick={onOpen} title="Preview source">
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
      {trailing ?? <ArrowUpRight size={15} />}
    </button>
  )
}
