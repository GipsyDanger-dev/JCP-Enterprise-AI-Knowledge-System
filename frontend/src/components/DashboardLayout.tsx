import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const SIDEBAR_KEY = 'jcp-sidebar-collapsed'

export function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'true')

  const toggleSidebar = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(SIDEBAR_KEY, String(next))
  }

  return (
    <main className={['app-shell', collapsed ? 'sidebar-collapsed' : ''].filter(Boolean).join(' ')}>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <Sidebar menuOpen={menuOpen} collapsed={collapsed} onToggle={toggleSidebar} onClose={() => setMenuOpen(false)} />
      <section className="workspace">
        <Topbar onMenuOpen={() => setMenuOpen(true)} />
        <div className="page-content"><Outlet /></div>
      </section>
    </main>
  )
}
