import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { initialDocuments, navigationFor, personFor } from '@/types/domain'
import type { Role } from '@/types/domain'
import { WorkspaceContext } from './workspaceContextValue'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('admin')
  const [documents, setDocuments] = useState(initialDocuments)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const changeRole = (nextRole: Role) => {
    setRole(nextRole)
    if (nextRole === 'employee' && location.pathname === '/users') navigate('/')
  }

  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setDocuments((current) => [{
      id: Date.now(),
      name: file.name,
      collection: 'Unassigned',
      updatedAt: 'Just now',
      status: 'Queued',
      chunks: null,
    }, ...current])
    event.target.value = ''
  }

  const onAsk = (event: FormEvent) => {
    event.preventDefault()
    if (!question.trim()) return
    setAnswer('Manager-level hotel expenses are capped at Rp900,000 per night. The policy requires an itemized receipt and prior approval for exceptions.')
  }

  const askQuestion = (value: string) => {
    setQuestion(value)
    setAnswer('Manager-level hotel expenses are capped at Rp900,000 per night. The policy requires an itemized receipt and prior approval for exceptions.')
  }

  const triggerUpload = () => uploadRef.current?.click()

  return (
    <WorkspaceContext.Provider value={{
      role,
      changeRole,
      person: personFor(role),
      navigation: navigationFor(role),
      documents,
      question,
      setQuestion,
      answer,
      onAsk,
      askQuestion,
      triggerUpload,
      onUpload,
    }}>
      <input ref={uploadRef} className="visually-hidden" type="file" accept=".pdf,.docx" onChange={onUpload} />
      {children}
    </WorkspaceContext.Provider>
  )
}
