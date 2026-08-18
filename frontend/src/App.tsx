import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from '@/components/DashboardLayout'
import { RequireAuth, RequireRole } from '@/components/RequireAuth'
import { AuthProvider } from '@/context/AuthProvider'
import { WorkspaceProvider } from '@/context/WorkspaceProvider'
import { ChatPage } from '@/pages/ChatPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { UsersPage } from '@/pages/UsersPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
              <Route index element={<OverviewPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="users" element={<RequireRole role="ADMIN"><UsersPage /></RequireRole>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
