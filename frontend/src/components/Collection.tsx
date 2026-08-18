import { BookOpen, ChevronRight } from 'lucide-react'

export function Collection({ name, count, color }: { name: string; count: string; color: string }) {
  return (
    <button className="collection-item">
      <span className={`collection-icon ${color}`}><BookOpen size={18} /></span>
      <span><strong>{name}</strong><small>{count}</small></span>
      <ChevronRight size={16} />
    </button>
  )
}
