import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <main className="app-shell">
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <Sidebar menuOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <section className="workspace">
        <Topbar onMenuOpen={() => setMenuOpen(true)} />
        <div className="page-content"><Outlet /></div>
      </section>
    </main>
  )
}
