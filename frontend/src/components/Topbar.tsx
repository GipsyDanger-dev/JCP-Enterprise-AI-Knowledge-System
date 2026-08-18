import { Bell, ChevronDown, Menu, Search, ShieldCheck, Users } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'

export function Topbar({ onMenuOpen }: { onMenuOpen: () => void }) {
  const { role, changeRole, person } = useWorkspace()
  return (
    <header className="topbar">
      <button className="menu-button" title="Open navigation" onClick={onMenuOpen}><Menu size={20} /></button>
      <div className="search-shell"><Search size={17} /><input aria-label="Search workspace" placeholder="Search documents, answers, or people" /></div>
      <div className="role-switch" aria-label="Preview dashboard role">
        <button className={role === 'admin' ? 'selected' : ''} onClick={() => changeRole('admin')}><ShieldCheck size={14} /> Admin</button>
        <button className={role === 'employee' ? 'selected' : ''} onClick={() => changeRole('employee')}><Users size={14} /> Employee</button>
      </div>
      <div className="top-actions">
        <button className="icon-button" title="Notifications"><Bell size={18} /><span className="notification-dot" /></button>
        <button className="top-profile"><span className="avatar small">{person.initials}</span><ChevronDown size={14} /></button>
      </div>
    </header>
  )
}
