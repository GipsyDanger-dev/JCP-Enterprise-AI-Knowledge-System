import type { ReactNode } from 'react'

export function PageHeading({ eyebrow, title, detail, action }: {
  eyebrow: string
  title: ReactNode
  detail: string
  action?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div><small>{eyebrow}</small><h1>{title}</h1><p>{detail}</p></div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  )
}
