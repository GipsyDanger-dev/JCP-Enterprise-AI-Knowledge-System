import { Activity, CircleHelp, Clock, LogOut, Settings, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { LogoMark } from '@/components/Logo'

export function Sidebar({ menuOpen, onClose }: { menuOpen: boolean; onClose: () => void }) {
  const { person, navigation } = useWorkspace()
  const { user, logout } = useAuth()
  return (
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand-lockup"><LogoMark size={28} /><strong>Enterprise AI</strong></div>
      <button className="mobile-close" title="Close navigation" onClick={onClose}><X size={20} /></button>
      <div className="sidebar-user-info">
        <span className="avatar">{person.initials}</span>
        <div>
          <strong>{user?.displayName ?? person.name}</strong>
          <small className="workspace-label">Jogja Creative</small>
        </div>
      </div>
      <nav aria-label="Primary navigation">
        <p>Workspace</p>
        {navigation.map(({ id, label, icon: Icon }) => (
          <NavLink key={id} to={id === 'overview' ? '/' : `/${id}`} end={id === 'overview'} onClick={onClose}
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            {({ isActive }) => (<><Icon size={18} /><span>{label}</span>{isActive && <i />}</>)}
          </NavLink>
        ))}
        <p style={{ marginTop: 16 }}>History</p>
        <NavLink to="/activity" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><Activity size={18} /><span>Activity log</span></NavLink>
        <NavLink to="/history" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><Clock size={18} /><span>Chat history</span></NavLink>
      </nav>
      <div className="sidebar-lower">
        <NavLink to="/help" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><CircleHelp size={18} /><span>Help center</span></NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><Settings size={18} /><span>Settings</span></NavLink>
        <button className="nav-item" title="Log out" onClick={logout}><LogOut size={18} /><span>Log out</span></button>
      </div>
    </aside>
  )
}
