import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { isTutorialHidden, setTutorialHidden, takeTutorialPending } from '@/utils/tutorial'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { TutorialModal } from './TutorialModal'

const SIDEBAR_KEY = 'jcp-sidebar-collapsed'

export function DashboardLayout() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'true')
  const [tutorialOpen, setTutorialOpen] = useState(false)

  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    // Sekali per login: penandanya dipakai habis di sini, jadi muat ulang
    // halaman tidak memunculkannya lagi.
    if (takeTutorialPending() && !isTutorialHidden(userId)) setTutorialOpen(true)
  }, [userId])

  const closeTutorial = (dontShowAgain: boolean) => {
    if (dontShowAgain && userId) setTutorialHidden(userId, true)
    setTutorialOpen(false)
  }

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
      {tutorialOpen && <TutorialModal offerDontShowAgain onClose={closeTutorial} />}
    </main>
  )
}
