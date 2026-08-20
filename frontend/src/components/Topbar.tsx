import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Menu, Search, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { userPresentation } from '@/utils/user'

export function Topbar({ onMenuOpen }: { onMenuOpen: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showProfile, setShowProfile] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showProfile) return
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProfile])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchValue.trim()) {
      navigate(`/documents?q=${encodeURIComponent(searchValue.trim())}`)
      setSearchValue('')
    }
  }

  if (!user) return null
  const person = userPresentation(user)

  return (
    <header className="topbar">
      <button className="menu-button" title="Open navigation" onClick={onMenuOpen}><Menu size={20} /></button>
      <form className="search-shell" onSubmit={handleSearch}>
        <Search size={17} />
        <input
          aria-label="Search workspace"
          placeholder="Search documents"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
      </form>
      <div className="top-actions">
        <div className="topbar-dropdown-wrap" ref={profileRef}>
          <button className="top-profile" onClick={() => setShowProfile(!showProfile)}>
            <span className="avatar small">{person.initials}</span><ChevronDown size={14} />
          </button>
          {showProfile && (
            <div className="topbar-dropdown profile-dropdown">
              <div className="dropdown-profile-info">
                <span className="avatar">{person.initials}</span>
                <div><strong>{person.name}</strong><small>{person.label}</small></div>
              </div>
              <div className="dropdown-divider" />
              <button className="dropdown-item" onClick={() => { setShowProfile(false); navigate('/settings') }}><User size={15} /> Profile settings</button>
              <button className="dropdown-item danger" onClick={logout}><LogOut size={15} /> Log out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
