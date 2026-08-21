import { Activity, CircleHelp, Clock, LogOut, MessageCircle, Settings, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { LogoMark } from '@/components/Logo'

export function Sidebar({ menuOpen, onClose }: { menuOpen: boolean; onClose: () => void }) {
  const { person, navigation, language, unreadMessages } = useWorkspace()
  const { user, logout } = useAuth()
  const isId = language === 'id'
  return (
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand-lockup"><LogoMark size={28} /><strong>Enterprise AI</strong></div>
      <button className="mobile-close" title={isId ? 'Tutup navigasi' : 'Close navigation'} onClick={onClose}><X size={20} /></button>
      <div className="sidebar-user-info">
        <span className="avatar">{person.initials}</span>
        <div>
          <strong>{user?.name ?? person.name}</strong>
          <small className="workspace-label">Jogja Creative</small>
        </div>
      </div>
      <nav aria-label="Primary navigation">
        <p>{isId ? 'Ruang kerja' : 'Workspace'}</p>
        {navigation.map(({ id, label, icon: Icon }) => (
          <NavLink key={id} to={id === 'overview' ? '/' : `/${id}`} end={id === 'overview'} onClick={onClose}
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            {({ isActive }) => (<><Icon size={18} /><span>{label}</span>{isActive && <i />}</>)}
          </NavLink>
        ))}
        <p style={{ marginTop: 16 }}>{isId ? 'Riwayat' : 'History'}</p>
        {user?.role === 'ADMIN'
          ? <NavLink to="/inbox" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><MessageCircle size={18} /><span>{isId ? 'Kotak masuk' : 'Inbox'}</span>{unreadMessages > 0 && <span className="nav-badge">{unreadMessages}</span>}</NavLink>
          : <NavLink to="/messages" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><MessageCircle size={18} /><span>{isId ? 'Pesan ke admin' : 'Message admin'}</span>{unreadMessages > 0 && <span className="nav-badge">{unreadMessages}</span>}</NavLink>
        }
        <NavLink to="/activity" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><Activity size={18} /><span>{isId ? 'Log aktivitas' : 'Activity log'}</span></NavLink>
        <NavLink to="/history" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><Clock size={18} /><span>{isId ? 'Riwayat chat' : 'Chat history'}</span></NavLink>
      </nav>
      <div className="sidebar-lower">
        <NavLink to="/help" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><CircleHelp size={18} /><span>{isId ? 'Pusat bantuan' : 'Help center'}</span></NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><Settings size={18} /><span>{isId ? 'Pengaturan' : 'Settings'}</span></NavLink>
        <button className="nav-item" title={isId ? 'Keluar' : 'Log out'} onClick={logout}><LogOut size={18} /><span>{isId ? 'Keluar' : 'Log out'}</span></button>
      </div>
    </aside>
  )
}
