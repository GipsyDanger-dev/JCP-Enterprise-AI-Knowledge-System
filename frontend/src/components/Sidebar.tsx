import { ChevronDown, CircleHelp, MoreHorizontal, Settings, Sparkles, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useWorkspace } from '@/hooks/useWorkspace'

export function Sidebar({ menuOpen, onClose }: { menuOpen: boolean; onClose: () => void }) {
  const { role, person, navigation } = useWorkspace()
  return (
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand-lockup"><span className="brand-mark"><Sparkles size={17} /></span><strong>JCP AI</strong></div>
      <button className="mobile-close" title="Close navigation" onClick={onClose}><X size={20} /></button>
      <div className="workspace-switcher"><span>JC</span><div><strong>Jogja Creative</strong><small>{role === 'admin' ? 'Admin workspace' : 'Employee portal'}</small></div><ChevronDown size={15} /></div>
      <nav aria-label="Primary navigation">
        <p>Workspace</p>
        {navigation.map(({ id, label, icon: Icon }) => (
          <NavLink key={id} to={id === 'overview' ? '/' : `/${id}`} end={id === 'overview'} onClick={onClose}
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            {({ isActive }) => (<><Icon size={18} /><span>{label}</span>{isActive && <i />}</>)}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-lower">
        <button className="nav-item"><CircleHelp size={18} /><span>Help center</span></button>
        <button className="nav-item"><Settings size={18} /><span>Settings</span></button>
        <div className="profile-row"><span className="avatar">{person.initials}</span><div><strong>{person.name}</strong><small>{person.label}</small></div><MoreHorizontal size={17} /></div>
      </div>
    </aside>
  )
}
