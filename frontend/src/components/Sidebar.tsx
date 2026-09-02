import { Activity, ChevronsLeft, ChevronsRight, CircleHelp, Clock, LogOut, MessageCircle, Settings, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { LogoMark } from '@/components/Logo'

export function Sidebar({ menuOpen, collapsed, onToggle, onClose }: { menuOpen: boolean; collapsed: boolean; onToggle: () => void; onClose: () => void }) {
  const { person, navigation, language, unreadMessages } = useWorkspace()
  const { user, logout } = useAuth()
  const isId = language === 'id'
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  return (
    <aside className={[menuOpen ? 'sidebar open' : 'sidebar', collapsed ? 'collapsed' : ''].filter(Boolean).join(' ')}>
      <div className="brand-lockup">
        {!collapsed && <LogoMark size={28} />}
        {!collapsed && <span className="brand-name">Enterprise AI</span>}
        <button className="sidebar-collapse-btn" title={collapsed ? 'Buka sidebar' : 'Tutup sidebar'} onClick={onToggle}>{collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}</button>
      </div>
      <button className="mobile-close" title={isId ? 'Tutup navigasi' : 'Close navigation'} onClick={onClose}><X size={20} /></button>
      {!collapsed && (
        <div className="sidebar-user-info">
          {user?.photoUrl ? <img className="avatar" src={user.photoUrl} alt="" style={{ objectFit: 'cover' }} /> : <span className="avatar">{person.initials}</span>}
          <div>
            <strong>{user?.displayName ?? person.name}</strong>
            <small className="workspace-label">Jogja Creative</small>
          </div>
        </div>
      )}
      {collapsed && <div className="sidebar-user-avatar">{user?.photoUrl ? <img className="avatar" src={user.photoUrl} alt="" style={{ objectFit: 'cover' }} /> : <span className="avatar">{person.initials}</span>}</div>}
      <nav aria-label="Primary navigation">
        {!collapsed && <p>{isId ? 'Ruang kerja' : 'Workspace'}</p>}
        {navigation.map(({ id, label, icon: Icon }) => (
          <NavLink key={id} to={id === 'overview' ? '/' : `/${id}`} end={id === 'overview'} onClick={onClose}
            title={collapsed ? label : undefined}
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            <><Icon size={18} />{!collapsed && <span>{label}</span>}</>
          </NavLink>
        ))}
        {!collapsed && <p style={{ marginTop: 16 }}>{isId ? 'Riwayat' : 'History'}</p>}
        {isAdmin
          ? <NavLink to="/inbox" title={collapsed ? (isId ? 'Kotak masuk' : 'Inbox') : undefined} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><MessageCircle size={18} />{!collapsed && <span>{isId ? 'Kotak masuk' : 'Inbox'}</span>}{unreadMessages > 0 && <span className="nav-badge">{unreadMessages}</span>}</NavLink>
          : <NavLink to="/messages" title={collapsed ? (isId ? 'Pesan ke admin' : 'Message admin') : undefined} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><MessageCircle size={18} />{!collapsed && <span>{isId ? 'Pesan ke admin' : 'Message admin'}</span>}{unreadMessages > 0 && <span className="nav-badge">{unreadMessages}</span>}</NavLink>
        }
        {isAdmin && <NavLink to="/activity" title={collapsed ? (isId ? 'Log aktivitas' : 'Activity log') : undefined} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><Activity size={18} />{!collapsed && <span>{isId ? 'Log aktivitas' : 'Activity log'}</span>}</NavLink>}
        <NavLink to="/history" title={collapsed ? (isId ? 'Riwayat chat' : 'Chat history') : undefined} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><Clock size={18} />{!collapsed && <span>{isId ? 'Riwayat chat' : 'Chat history'}</span>}</NavLink>
      </nav>
      <div className="sidebar-lower">
        <NavLink to="/help" title={collapsed ? (isId ? 'Pusat bantuan' : 'Help center') : undefined} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><CircleHelp size={18} />{!collapsed && <span>{isId ? 'Pusat bantuan' : 'Help center'}</span>}</NavLink>
        <NavLink to="/settings" title={collapsed ? (isId ? 'Pengaturan' : 'Settings') : undefined} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} onClick={onClose}><Settings size={18} />{!collapsed && <span>{isId ? 'Pengaturan' : 'Settings'}</span>}</NavLink>
        <button className="nav-item" title={isId ? 'Keluar' : 'Log out'} onClick={logout}><LogOut size={18} />{!collapsed && <span>{isId ? 'Keluar' : 'Log out'}</span>}</button>
      </div>
    </aside>
  )
}
