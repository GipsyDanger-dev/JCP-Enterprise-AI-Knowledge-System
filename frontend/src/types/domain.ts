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

export function quickQuestions(lang: 'en' | 'id' = 'en', documents: Array<{ name: string; status: string }> = []) {
  const readyDocuments = documents.filter((document) => document.status === 'Ready').slice(0, 3)
  if (readyDocuments.length > 0) {
    return readyDocuments.map((document) => lang === 'id'
      ? `Apa isi utama dokumen ${document.name}?`
      : `What are the key points in ${document.name}?`)
  }
  return lang === 'id'
    ? ['Tanyakan tentang dokumen perusahaan yang sudah diunggah.']
    : ['Ask about a company document that has been uploaded.']
}

export function navigationFor(role: Role, lang: 'en' | 'id' = 'en'): NavigationItem[] {
  return role === 'admin' ? adminNavigation(lang) : employeeNavigation(lang)
}
