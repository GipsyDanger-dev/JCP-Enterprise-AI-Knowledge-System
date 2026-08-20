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
export type DocumentStatus = 'Uploaded' | 'Ready' | 'Processing' | 'Queued' | 'Failed' | 'Deleted'

export interface DocumentItem {
  id: string
  name: string
  updatedAt: string
  status: DocumentStatus
}

export type IconType = ComponentType<{ size?: number | string }>

export interface NavigationItem {
  id: View
  label: string
  icon: IconType
}

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

export function navigationFor(role: Role): NavigationItem[] {
  return role === 'admin' ? adminNavigation : employeeNavigation
}
