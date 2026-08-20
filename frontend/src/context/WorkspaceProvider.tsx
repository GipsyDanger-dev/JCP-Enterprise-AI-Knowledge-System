import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { queryChat } from '@/api/chat'
import { errorMessage } from '@/api/client'
import { deleteDocument, getDocumentStatus, listDocuments, uploadDocument } from '@/api/documents'
import { toDomainDocument, toDomainDocumentStatus, toDomainRole } from '@/api/mappers'
import { useAuth } from '@/hooks/useAuth'
import type { Citation } from '@/types/domain'
import { initialDocuments, navigationFor, personFor } from '@/types/domain'
import type { Role } from '@/types/domain'
import { WorkspaceContext } from './workspaceContextValue'

const POLL_INTERVAL_MS = 2000

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const [role, setRole] = useState<Role>(() => (user ? toDomainRole(user.role) : 'admin'))
  const [documents, setDocuments] = useState(initialDocuments)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [isLoadingAnswer, setIsLoadingAnswer] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  // Role mengikuti akun yang login; reset saat logout
  useEffect(() => {
    setRole(user ? toDomainRole(user.role) : 'admin')
  }, [user])

  // Muat dokumen dari API saat login; fallback ke data lokal bila gagal
  useEffect(() => {
    if (!user) {
      setDocuments(initialDocuments)
      return
    }
    let cancelled = false
    listDocuments(token ?? undefined)
      .then((docs) => { if (!cancelled) setDocuments(docs.map(toDomainDocument)) })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Gagal memuat dokumen, memakai data lokal:', err)
          setDocuments(initialDocuments)
        }
      })
    return () => { cancelled = true }
  }, [user, token])

  // Polling status dokumen yang sedang diproses (queued/processing)
  useEffect(() => {
    if (!token) return
    const active = documents.filter((doc) => doc.status === 'Queued' || doc.status === 'Processing')
    if (active.length === 0) return
    const interval = setInterval(() => {
      active.forEach((doc) => {
        getDocumentStatus(doc.id, token)
          .then((status) => {
            setDocuments((current) => current.map((item) => item.id === status.id
              ? { ...item, status: toDomainDocumentStatus(status.status) }
              : item))
          })
          .catch(() => { /* biarkan polling berikutnya mencoba lagi */ })
      })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [documents, token])

  const changeRole = (nextRole: Role) => {
    setRole(nextRole)
    if (nextRole === 'employee' && location.pathname === '/users') navigate('/')
  }

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsUploading(true)
    setUploadError(null)
    try {
      const doc = await uploadDocument(file, token ?? undefined)
      setDocuments((current) => [toDomainDocument(doc), ...current])
    } catch (err) {
      setUploadError(errorMessage(err))
    } finally {
      setIsUploading(false)
    }
  }

  const removeDocument = async (id: string) => {
    if (!token) return
    try {
      await deleteDocument(id, token)
      setDocuments((current) => current.filter((doc) => doc.id !== id))
    } catch (err) {
      setUploadError(errorMessage(err))
    }
  }

  const sendQuestion = async (q: string) => {
    if (!q.trim()) return
    setIsLoadingAnswer(true)
    setChatError(null)
    setAnswer('')
    setCitations([])
    try {
      const res = await queryChat({ question: q }, token ?? undefined)
      setAnswer(res.answer ?? '')
      setCitations(res.citations)
      if (!res.answer && res.message) {
        setChatError(res.message)
      }
    } catch (err) {
      setChatError(errorMessage(err))
    } finally {
      setIsLoadingAnswer(false)
    }
  }

  const onAsk = (event: FormEvent) => {
    event.preventDefault()
    sendQuestion(question)
  }

  const askQuestion = (value: string) => {
    setQuestion(value)
    sendQuestion(value)
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
      citations,
      isLoadingAnswer,
      chatError,
      onAsk,
      askQuestion,
      triggerUpload,
      onUpload,
      isUploading,
      uploadError,
      removeDocument,
    }}>
      <input ref={uploadRef} className="visually-hidden" type="file" accept=".pdf,.docx" onChange={onUpload} />
      {children}
    </WorkspaceContext.Provider>
  )
}
