import { Check, MoreHorizontal, Plus } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'

const people = [
  { initials: 'AR', name: 'Adam', email: 'adam@jcp.co.id', role: 'Workspace admin', access: 'Full access' },
  { initials: 'NS', name: 'Nadia S.', email: 'nadia@jcp.co.id', role: 'Editor', access: 'Operations' },
  { initials: 'RD', name: 'Raka D.', email: 'raka@jcp.co.id', role: 'Member', access: 'IT & Security' },
]

export function UsersPage() {
  return (
    <div className="standard-page">
      <PageHeading eyebrow="Access management" title="People & access" detail="Manage who can access collections and AI answers." action={<button className="primary-button"><Plus size={17} /> Invite person</button>} />
      <div className="data-table">
        <table>
          <thead><tr><th>Person</th><th>Role</th><th>Collection access</th><th>Status</th><th /></tr></thead>
          <tbody>{people.map((person) => (
            <tr key={person.email}>
              <td><div className="person-cell"><span className="avatar">{person.initials}</span><span><strong>{person.name}</strong><small>{person.email}</small></span></div></td>
              <td>{person.role}</td>
              <td>{person.access}</td>
              <td><span className="active-user"><Check size={13} /> Active</span></td>
              <td><button className="icon-button" title={`Actions for ${person.name}`}><MoreHorizontal size={17} /></button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}
