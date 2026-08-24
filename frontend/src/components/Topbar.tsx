import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, Loader2, LogOut, Menu, Moon, Search, Sun, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { listAuditLogs, type AuditLogEntry } from '@/api/auditLogs'

export function Topbar({ onMenuOpen }: { onMenuOpen: () => void }) {
  const { person, language, setLanguage } = useWorkspace()
  const { logout, token, user } = useAuth()
  const isId = language === 'id'
  const navigate = useNavigate()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [notifications, setNotifications] = useState<AuditLogEntry[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('jcp-theme')
    return stored === 'dark' ? 'dark' : 'light'
  })
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncTheme = () => {
      const next = localStorage.getItem('jcp-theme') === 'dark' ? 'dark' : 'light'
      setTheme(next)
    }
    window.addEventListener('jcp-theme-change', syncTheme)
    return () => window.removeEventListener('jcp-theme-change', syncTheme)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('jcp-theme', next)
    document.documentElement.setAttribute('data-theme', next)
    window.dispatchEvent(new Event('jcp-theme-change'))
  }

  useEffect(() => {
    if (!showNotifications && !showProfile) return
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNotifications, showProfile])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchValue.trim()) {
      navigate(`/documents?q=${encodeURIComponent(searchValue.trim())}`)
      setSearchValue('')
    }
  }

  useEffect(() => {
    if (!showNotifications || !token || user?.role !== 'ADMIN') return
    setNotificationsLoading(true)
    listAuditLogs(token, 5)
      .then((response) => setNotifications(response.data))
      .catch(() => setNotifications([]))
      .finally(() => setNotificationsLoading(false))
  }, [showNotifications, token, user?.role])

  const activityLabel = (entry: AuditLogEntry) => {
    const labels: Record<string, { id: string; en: string }> = {
      AUTH_LOGIN: { id: 'Login ke sistem', en: 'Signed in to the system' },
      USER_CREATED: { id: 'Pengguna dibuat', en: 'User created' },
      USER_UPDATED: { id: 'Pengguna diperbarui', en: 'User updated' },
      DOCUMENT_UPLOADED: { id: 'Dokumen diunggah', en: 'Document uploaded' },
      DOCUMENT_DELETED: { id: 'Dokumen dihapus', en: 'Document deleted' },
      PROCESSING_JOB_COMPLETED: { id: 'Dokumen selesai diproses', en: 'Document processing completed' },
      PROCESSING_JOB_FAILED: { id: 'Pemrosesan dokumen gagal', en: 'Document processing failed' },
    }
    return labels[entry.action]?.[isId ? 'id' : 'en'] ?? entry.action
  }

  return (
    <header className="topbar">
      <button className="menu-button" title="Open navigation" onClick={onMenuOpen}><Menu size={20} /></button>
      <form className="search-shell" onSubmit={handleSearch}>
        <Search size={17} />
        <input
          aria-label={isId ? 'Cari di ruang kerja' : 'Search workspace'}
          placeholder={isId ? 'Cari dokumen, jawaban, atau orang' : 'Search documents, answers, or people'}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
      </form>
      <div className="top-actions">
        <button
          className="topbar-shortcut topbar-language"
          title={isId ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
          aria-label={isId ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
          onClick={() => setLanguage(isId ? 'en' : 'id')}
        >
          <span>{isId ? 'EN' : 'ID'}</span>
        </button>
        <button
          className="topbar-shortcut"
          title={theme === 'light' ? (isId ? 'Aktifkan tema gelap' : 'Use dark theme') : (isId ? 'Aktifkan tema terang' : 'Use light theme')}
          aria-label={theme === 'light' ? 'Dark theme' : 'Light theme'}
          onClick={toggleTheme}
        >
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <div className="topbar-dropdown-wrap" ref={notifRef}>
          <button className="icon-button" title="Notifications" onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false) }}>
            <Bell size={18} />{notifications.length > 0 && <span className="notification-dot" />}
          </button>
          {showNotifications && (
            <div className="topbar-dropdown notification-dropdown">
              <div className="dropdown-header"><strong>{isId ? 'Notifikasi' : 'Notifications'}</strong></div>
              {notificationsLoading ? <div className="dropdown-empty"><Loader2 size={15} className="spin" /> {isId ? 'Memuat...' : 'Loading...'}</div> : notifications.length === 0 ? <div className="dropdown-empty">{isId ? 'Belum ada aktivitas baru.' : 'No recent activity.'}</div> : notifications.map((entry) => (
                <div className="dropdown-item" key={entry.id}><div className="dropdown-item-dot" /><div><small>{new Date(entry.createdAt).toLocaleString(isId ? 'id-ID' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}</small><p>{activityLabel(entry)}</p></div></div>
              ))}
            </div>
          )}
        </div>

        <div className="topbar-dropdown-wrap" ref={profileRef}>
          <button className="top-profile" onClick={() => { setShowProfile(!showProfile); setShowNotifications(false) }}>
            {user?.photoUrl
              ? <img className="avatar small user-photo-avatar" src={user.photoUrl} alt={`${person.name} profile`} />
              : <span className="avatar small">{person.initials}</span>}
            <ChevronDown size={14} />
          </button>
          {showProfile && (
            <div className="topbar-dropdown profile-dropdown">
              <div className="dropdown-profile-info">
                {user?.photoUrl
                  ? <img className="avatar user-photo-avatar" src={user.photoUrl} alt={`${person.name} profile`} />
                  : <span className="avatar">{person.initials}</span>}
                <div><strong>{person.name}</strong><small>{person.label}</small></div>
              </div>
              <div className="dropdown-divider" />
              <button className="dropdown-item" onClick={() => { setShowProfile(false); navigate('/settings') }}><User size={15} /> {isId ? 'Pengaturan profil' : 'Profile settings'}</button>
              <button className="dropdown-item danger" onClick={logout}><LogOut size={15} /> {isId ? 'Keluar' : 'Log out'}</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
