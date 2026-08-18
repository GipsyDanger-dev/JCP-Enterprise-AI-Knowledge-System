import { ArrowUpRight, CheckCircle2, Compass } from 'lucide-react'

export function RequiredRead({ title, category, due, progress }: { title: string; category: string; due: string; progress: number }) {
  return (
    <div className="required-item">
      <span className={progress === 100 ? 'required-icon complete' : 'required-icon'}>{progress === 100 ? <CheckCircle2 size={18} /> : <Compass size={18} />}</span>
      <div><strong>{title}</strong><small>{category}</small></div>
      <div className="reading-progress"><div><i style={{ width: `${progress}%` }} /></div><span>{due}</span></div>
      <button className="icon-button" title={`Open ${title}`}><ArrowUpRight size={16} /></button>
    </div>
  )
}
