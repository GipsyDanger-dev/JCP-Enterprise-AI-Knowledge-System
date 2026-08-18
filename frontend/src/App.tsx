import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from '@/components/DashboardLayout'
import { WorkspaceProvider } from '@/context/WorkspaceProvider'
import { ChatPage } from '@/pages/ChatPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { UsersPage } from '@/pages/UsersPage'

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </WorkspaceProvider>
    </BrowserRouter>
  )
}
