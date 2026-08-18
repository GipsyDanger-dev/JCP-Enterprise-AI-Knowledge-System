import { BookOpen, ChevronRight } from 'lucide-react'

export function Collection({ name, count, color, onClick }: { name: string; count: string; color: string; onClick?: () => void }) {
  return (
    <button className="collection-item" onClick={onClick}>
      <span className={`collection-icon ${color}`}><BookOpen size={18} /></span>
      <span><strong>{name}</strong><small>{count}</small></span>
      <ChevronRight size={16} />
    </button>
  )
}
