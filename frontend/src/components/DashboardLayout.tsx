import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { X } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const SIDEBAR_KEY = 'jcp-sidebar-collapsed'

export function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'true')
  const [showBanner, setShowBanner] = useState(true)
  const { language } = useWorkspace()
  const isId = language === 'id'

  const toggleSidebar = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(SIDEBAR_KEY, String(next))
  }

  return (
    <main className={[showBanner ? 'app-shell banner-visible' : 'app-shell', collapsed ? 'sidebar-collapsed' : ''].filter(Boolean).join(' ')}>
      {showBanner && <div className="announcement"><span>{isId ? 'Baru' : 'New'}</span> {isId ? 'Tinjauan bukti sekarang tersedia untuk setiap jawaban AI.' : 'Evidence review is now available for every AI answer.'}<button className="banner-close" title={isId ? 'Tutup' : 'Dismiss'} onClick={() => setShowBanner(false)}><X size={14} /></button></div>}
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <Sidebar menuOpen={menuOpen} collapsed={collapsed} onToggle={toggleSidebar} onClose={() => setMenuOpen(false)} />
      <section className="workspace">
        <Topbar onMenuOpen={() => setMenuOpen(true)} />
        <div className="page-content"><Outlet /></div>
      </section>
    </main>
  )
}
