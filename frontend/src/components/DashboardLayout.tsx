import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { X } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showBanner, setShowBanner] = useState(true)
  return (
    <main className={showBanner ? 'app-shell banner-visible' : 'app-shell'}>
      {showBanner && <div className="announcement"><span>New</span> Evidence review is now available for every AI answer.<button className="banner-close" title="Dismiss" onClick={() => setShowBanner(false)}><X size={14} /></button></div>}
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <Sidebar menuOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <section className="workspace">
        <Topbar onMenuOpen={() => setMenuOpen(true)} />
        <div className="page-content"><Outlet /></div>
      </section>
    </main>
  )
}
