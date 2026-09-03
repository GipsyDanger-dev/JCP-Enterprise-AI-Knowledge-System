import { createContext } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { ApiDocument } from '@/api/types'
import type { Citation, DocumentItem, NavigationItem, Person, Role } from '@/types/domain'

export type Language = 'en' | 'id'

export interface ChatMessage {
  id: string
  question: string
  answer: string
  citations: Citation[]
  suggestions: string[]
  awaitingChoice: boolean
  error: string | null
  timestamp: number
}

export interface WorkspaceContextValue {
  role: Role
  changeRole: (role: Role) => void
  person: Person
  navigation: NavigationItem[]
  documents: DocumentItem[]
  question: string
  setQuestion: (value: string) => void
  chatHistory: ChatMessage[]
  clearChat: () => void
  isLoadingAnswer: boolean
  // AI sedang menunggu pengguna memilih salah satu pertanyaan lanjutan.
  awaitingChoice: boolean
  onAsk: (event: FormEvent) => void
  askQuestion: (value: string) => void
  triggerUpload: () => void
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void
  isUploading: boolean
  uploadError: string | null
  registerUploadedDocument: (document: ApiDocument) => void
  removeDocument: (id: string) => Promise<void>
  language: Language
  setLanguage: (lang: Language) => void
  unreadMessages: number
  setUnreadMessages: (count: number) => void
  /** Pengumuman yang belum dibaca — dipakai badge di sidebar. */
  unreadAnnouncements: number
  /** Tandai seluruh pengumuman terbaca dan bersihkan badge. */
  markAnnouncementsSeen: () => Promise<void>
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
