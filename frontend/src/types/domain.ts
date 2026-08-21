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

export function adminNavigation(lang: 'en' | 'id' = 'en'): NavigationItem[] {
  return lang === 'id'
    ? [
        { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
        { id: 'documents', label: 'Dokumen', icon: FolderOpen },
        { id: 'chat', label: 'Asisten AI', icon: MessageSquareText },
        { id: 'users', label: 'Orang & akses', icon: Users },
      ]
    : [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'documents', label: 'Documents', icon: FolderOpen },
        { id: 'chat', label: 'AI Assistant', icon: MessageSquareText },
        { id: 'users', label: 'People & access', icon: Users },
      ]
}

export function employeeNavigation(lang: 'en' | 'id' = 'en'): NavigationItem[] {
  return lang === 'id'
    ? [
        { id: 'overview', label: 'Beranda', icon: LayoutDashboard },
        { id: 'chat', label: 'Tanya AI', icon: MessageSquareText },
        { id: 'documents', label: 'Perpustakaan pengetahuan', icon: Library },
      ]
    : [
        { id: 'overview', label: 'Home', icon: LayoutDashboard },
        { id: 'chat', label: 'Ask AI', icon: MessageSquareText },
        { id: 'documents', label: 'Knowledge library', icon: Library },
      ]
}

export const quickQuestionsEn = [
  'What is the hotel allowance for managers?',
  'Summarize our procurement approval flow',
  'Which security policy applies to contractors?',
]

export const quickQuestionsId = [
  'Berapa tunjangan hotel untuk manajer?',
  'Ringkas alur persetujuan procurement kami',
  'Kebijakan keamanan mana yang berlaku untuk kontraktor?',
]

export function quickQuestions(lang: 'en' | 'id' = 'en') {
  return lang === 'id' ? quickQuestionsId : quickQuestionsEn
}

export function personFor(role: Role): Person {
  return role === 'admin'
    ? { name: 'Adam', initials: 'AR', label: '' }
    : { name: 'Nadia', initials: 'NS', label: '' }
}

export function navigationFor(role: Role, lang: 'en' | 'id' = 'en'): NavigationItem[] {
  return role === 'admin' ? adminNavigation(lang) : employeeNavigation(lang)
}
