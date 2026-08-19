import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from '@/components/DashboardLayout'
import { RequireAuth, RequireRole } from '@/components/RequireAuth'
import { AuthProvider } from '@/context/AuthProvider'
import { WorkspaceProvider } from '@/context/WorkspaceProvider'
import { ActivityPage } from '@/pages/ActivityPage'
import { ChatPage } from '@/pages/ChatPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { HelpPage } from '@/pages/HelpPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { UsersPage } from '@/pages/UsersPage'

function ThemeInitializer() {
  useEffect(() => {
    const stored = localStorage.getItem('jcp-theme')
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored)
    }
  }, [])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeInitializer />
      <AuthProvider>
        <WorkspaceProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
              <Route index element={<OverviewPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="users" element={<RequireRole role="ADMIN"><UsersPage /></RequireRole>} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="help" element={<HelpPage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="history" element={<HistoryPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
