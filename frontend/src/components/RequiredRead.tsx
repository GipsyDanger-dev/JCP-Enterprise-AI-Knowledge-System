import { ArrowUpRight, CheckCircle2, Compass } from 'lucide-react'

export function RequiredRead({ title, category, due, progress, overdue = false, onClick }: { title: string; category: string; due: string; progress: number; overdue?: boolean; onClick?: () => void }) {
  return (
    <div className="required-item" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <span className={progress === 100 ? 'required-icon complete' : 'required-icon'}>{progress === 100 ? <CheckCircle2 size={18} /> : <Compass size={18} />}</span>
      <div><strong>{title}</strong><small>{category}</small></div>
      <div className={overdue ? 'reading-progress overdue' : 'reading-progress'}><div><i style={{ width: `${progress}%` }} /></div><span>{due}</span></div>
      <button className="icon-button" title={`Open ${title}`} onClick={(e) => { e.stopPropagation(); onClick?.() }}><ArrowUpRight size={16} /></button>
    </div>
  )
}
