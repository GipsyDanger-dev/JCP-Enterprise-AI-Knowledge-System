import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, LogOut, Menu, Search, ShieldCheck, User, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

export function Topbar({ onMenuOpen }: { onMenuOpen: () => void }) {
  const { role, changeRole, person } = useWorkspace()
  const { logout } = useAuth()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on click outside
  useEffect(() => {
    if (!showNotifications && !showProfile) return
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNotifications, showProfile])

  return (
    <header className="topbar">
      <button className="menu-button" title="Open navigation" onClick={onMenuOpen}><Menu size={20} /></button>
      <div className="search-shell"><Search size={17} /><input aria-label="Search workspace" placeholder="Search documents, answers, or people" /></div>
      <div className="role-switch" aria-label="Preview dashboard role">
        <button className={role === 'admin' ? 'selected' : ''} onClick={() => changeRole('admin')}><ShieldCheck size={14} /> Admin</button>
        <button className={role === 'employee' ? 'selected' : ''} onClick={() => changeRole('employee')}><Users size={14} /> Employee</button>
      </div>
      <div className="top-actions">
        {/* Notifications */}
        <div className="topbar-dropdown-wrap" ref={notifRef}>
          <button className="icon-button" title="Notifications" onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false) }}>
            <Bell size={18} /><span className="notification-dot" />
          </button>
          {showNotifications && (
            <div className="topbar-dropdown notification-dropdown">
              <div className="dropdown-header"><strong>Notifications</strong></div>
              <div className="dropdown-item"><div className="dropdown-item-dot" /><div><small>2 menit lalu</small><p>Dokumen "SOP Perjalanan Dinas" selesai di-index</p></div></div>
              <div className="dropdown-item"><div className="dropdown-item-dot" /><div><small>1 jam lalu</small><p>3 dokumen baru ditambahkan ke Operations</p></div></div>
              <div className="dropdown-item dim"><div><small>Yesterday</small><p>System update selesai</p></div></div>
              <div className="dropdown-footer"><button onClick={() => setShowNotifications(false)}>Dismiss all</button></div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="topbar-dropdown-wrap" ref={profileRef}>
          <button className="top-profile" onClick={() => { setShowProfile(!showProfile); setShowNotifications(false) }}>
            <span className="avatar small">{person.initials}</span><ChevronDown size={14} />
          </button>
          {showProfile && (
            <div className="topbar-dropdown profile-dropdown">
              <div className="dropdown-profile-info">
                <span className="avatar">{person.initials}</span>
                <div><strong>{person.name}</strong><small>{person.label}</small></div>
              </div>
              <div className="dropdown-divider" />
              <button className="dropdown-item" onClick={() => setShowProfile(false)}><User size={15} /> Profile settings</button>
              <button className="dropdown-item danger" onClick={logout}><LogOut size={15} /> Log out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
