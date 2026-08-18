import { createContext } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Citation, DocumentItem, NavigationItem, Person, Role } from '@/types/domain'

export interface WorkspaceContextValue {
  role: Role
  changeRole: (role: Role) => void
  person: Person
  navigation: NavigationItem[]
  documents: DocumentItem[]
  question: string
  setQuestion: (value: string) => void
  answer: string
  citations: Citation[]
  isLoadingAnswer: boolean
  chatError: string | null
  onAsk: (event: FormEvent) => void
  askQuestion: (value: string) => void
  triggerUpload: () => void
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void
  isUploading: boolean
  uploadError: string | null
  removeDocument: (id: number) => Promise<void>
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
