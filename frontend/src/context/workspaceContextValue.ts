import { createContext } from 'react'
import type { FormEvent } from 'react'
import type { ApiDocument } from '@/api/types'
import type { Citation, DocumentItem, NavigationItem, Role } from '@/types/domain'

export interface WorkspaceContextValue {
  role: Role | null
  navigation: NavigationItem[]
  documents: DocumentItem[]
  documentsLoading: boolean
  documentsError: string | null
  reloadDocuments: () => Promise<void>
  question: string
  setQuestion: (value: string) => void
  answer: string
  citations: Citation[]
  isLoadingAnswer: boolean
  chatError: string | null
  onAsk: (event: FormEvent) => void
  askQuestion: (value: string) => void
  startNewConversation: () => void
  uploadError: string | null
  registerUploadedDocument: (document: ApiDocument) => void
  removeDocument: (id: string) => Promise<boolean>
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
