import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
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

  // Halaman baru dibuka dari atas. Tanpa ini posisi gulir halaman sebelumnya
  // terbawa, dan di HP pengguna mendarat di tengah halaman yang baru.
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  // Selama laci navigasi terbuka di HP, halaman di belakangnya tidak ikut
  // bergulir, dan tombol Escape menutupnya seperti dialog lain.
  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <main className={['app-shell', collapsed ? 'sidebar-collapsed' : ''].filter(Boolean).join(' ')}>
      {/* Selalu dirender supaya bisa memudar keluar bersama laci yang menutup,
          bukan hilang seketika sementara lacinya masih bergeser. */}
      <div className={menuOpen ? 'sidebar-backdrop open' : 'sidebar-backdrop'} aria-hidden="true" onClick={() => setMenuOpen(false)} />
      <Sidebar menuOpen={menuOpen} collapsed={collapsed} onToggle={toggleSidebar} onClose={() => setMenuOpen(false)} />
      <section className="workspace">
        <Topbar onMenuOpen={() => setMenuOpen(true)} />
        <div className="page-content"><Outlet /></div>
      </section>
      {tutorialOpen && <TutorialModal offerDontShowAgain onClose={closeTutorial} />}
    </main>
  )
}
