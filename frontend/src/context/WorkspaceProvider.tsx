import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { queryChat } from '@/api/chat'
import { errorMessage } from '@/api/client'
import { deleteDocument, getDocumentStatus, listDocuments, uploadDocument } from '@/api/documents'
import { listConversations, getEmployeeConversation } from '@/api/messaging'
import { toDomainDocument, toDomainDocumentStatus, toDomainRole } from '@/api/mappers'
import { useAuth } from '@/hooks/useAuth'
import type { Citation } from '@/types/domain'
import { initialDocuments, navigationFor, personFor } from '@/types/domain'
import type { Role } from '@/types/domain'
import { WorkspaceContext } from './workspaceContextValue'
import type { Language } from './workspaceContextValue'
import { notifyNewMessage } from '@/utils/notifications'

const POLL_INTERVAL_MS = 2000
const LANG_KEY = 'jcp-lang'

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
  const [language, setLanguageState] = useState<Language>(() => {
    const v = localStorage.getItem(LANG_KEY)
    return v === 'id' ? 'id' : 'en'
  })
  const [unreadMessages, setUnreadMessages] = useState(0)
  const prevUnreadRef = useRef(0)
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
              ? { ...item, status: toDomainDocumentStatus(status.status), chunks: status.chunks ?? item.chunks }
              : item))
          })
          .catch(() => { /* biarkan polling berikutnya mencoba lagi */ })
      })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [documents, token])

  // Polling unread messages + notification
  useEffect(() => {
    if (!user || !token) { setUnreadMessages(0); prevUnreadRef.current = 0; return }
    let cancelled = false
    const poll = async () => {
      try {
        let count = 0
        let notifName: string | undefined
        let notifPreview: string | undefined
        if (user.role === 'ADMIN') {
          const convs = await listConversations(token)
          if (!cancelled) {
            count = convs.reduce((sum, c) => sum + c.unreadCount, 0)
            // Find conversation with new unread for notification context
            const unread = convs.find((c) => c.unreadCount > 0)
            if (unread) {
              notifName = unread.employeeName
              notifPreview = unread.lastMessage
            }
          }
        } else {
          const conv = await getEmployeeConversation(user.id, token)
          if (!cancelled) {
            count = conv.unreadCount
            notifName = 'Admin'
            notifPreview = conv.lastMessage
          }
        }
        if (!cancelled) {
          // Trigger notification when unread count increases
          if (count > prevUnreadRef.current) {
            notifyNewMessage(notifName, notifPreview)
          }
          prevUnreadRef.current = count
          setUnreadMessages(count)
        }
      } catch { /* ignore */ }
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [user, token])

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

  const removeDocument = async (id: number) => {
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

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(LANG_KEY, lang)
  }

  return (
    <WorkspaceContext.Provider value={{
      role,
      changeRole,
      person: personFor(role),
      navigation: navigationFor(role, language),
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
      language,
      setLanguage,
      unreadMessages,
      setUnreadMessages,
    }}>
      <input ref={uploadRef} className="visually-hidden" type="file" accept=".pdf,.docx" onChange={onUpload} />
      {children}
    </WorkspaceContext.Provider>
  )
}
