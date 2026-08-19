import type { ComponentType } from 'react'
import {
  FolderOpen,
  LayoutDashboard,
  Library,
  MessageSquareText,
  Users,
} from 'lucide-react'

export type { Citation } from '@/api/types'

export type View = 'overview' | 'documents' | 'chat' | 'users'
export type Role = 'admin' | 'employee'
export type DocumentStatus = 'Ready' | 'Processing' | 'Queued' | 'Failed'

export interface DocumentItem {
  id: number
  name: string
  collection: string
  updatedAt: string
  status: DocumentStatus
  chunks: number | null
}

export type IconType = ComponentType<{ size?: number | string }>

export interface NavigationItem {
  id: View
  label: string
  icon: IconType
}

export interface Person {
  name: string
  initials: string
  label: string
}

export const initialDocuments: DocumentItem[] = [
  { id: 1, name: 'SOP Perjalanan Dinas 2026.pdf', collection: 'Operations', updatedAt: '18 Aug, 10:42', status: 'Ready', chunks: 42 },
  { id: 2, name: 'Kebijakan Keamanan Informasi.docx', collection: 'IT & Security', updatedAt: '18 Aug, 09:16', status: 'Ready', chunks: 28 },
  { id: 3, name: 'Panduan Procurement.pdf', collection: 'Finance', updatedAt: '17 Aug, 16:30', status: 'Processing', chunks: null },
  { id: 4, name: 'Employee Handbook 2026.pdf', collection: 'People', updatedAt: '16 Aug, 13:05', status: 'Ready', chunks: 61 },
]

export const adminNavigation: NavigationItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'chat', label: 'AI Assistant', icon: MessageSquareText },
  { id: 'users', label: 'People & access', icon: Users },
]

export const employeeNavigation: NavigationItem[] = [
  { id: 'overview', label: 'Home', icon: LayoutDashboard },
  { id: 'chat', label: 'Ask AI', icon: MessageSquareText },
  { id: 'documents', label: 'Knowledge library', icon: Library },
]

export const quickQuestions = [
  'What is the hotel allowance for managers?',
  'Summarize our procurement approval flow',
  'Which security policy applies to contractors?',
]

export function personFor(role: Role): Person {
  return role === 'admin'
    ? { name: 'Adam', initials: 'AR', label: 'Workspace admin' }
    : { name: 'Nadia', initials: 'NS', label: 'Employee' }
}

export function navigationFor(role: Role): NavigationItem[] {
  return role === 'admin' ? adminNavigation : employeeNavigation
}
