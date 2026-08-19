import { ArrowUpRight, FileText } from 'lucide-react'

export function Metric({ icon: Icon, value, label, note }: {
  icon: typeof FileText
  value: number | string
  label: string
  note: string
}) {
  return (
    <div className="metric-card">
      <div className="metric-top"><span><Icon size={18} /></span><ArrowUpRight size={15} /></div>
      <strong>{value}</strong>
      <p>{label}</p>
      <small>{note}</small>
    </div>
  )
}
