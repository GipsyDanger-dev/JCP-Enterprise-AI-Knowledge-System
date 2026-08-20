import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { queryChat } from '@/api/chat'
import { errorMessage } from '@/api/client'
import { deleteDocument, getDocumentStatus, listDocuments } from '@/api/documents'
import { toDomainDocument, toDomainDocumentStatus, toDomainRole } from '@/api/mappers'
import type { ApiDocument } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'
import type { Citation } from '@/types/domain'
import { navigationFor } from '@/types/domain'
import { WorkspaceContext } from './workspaceContextValue'

const POLL_INTERVAL_MS = 2000

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const role = user ? toDomainRole(user.role) : null
  const navigation = role ? navigationFor(role) : []
  const [documents, setDocuments] = useState<ReturnType<typeof toDomainDocument>[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const documentRequestGeneration = useRef(0)
  const chatRequestGeneration = useRef(0)
  const activeChatRequestGeneration = useRef<number | null>(null)
  const currentConversationId = useRef<string | null>(null)
  const activeUserId = useRef<string | null>(user?.id ?? null)
  activeUserId.current = user?.id ?? null
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [isLoadingAnswer, setIsLoadingAnswer] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const startNewConversation = useCallback(() => {
    chatRequestGeneration.current += 1
    activeChatRequestGeneration.current = null
    currentConversationId.current = null
    setQuestion('')
    setAnswer('')
    setCitations([])
    setChatError(null)
    setIsLoadingAnswer(false)
  }, [])

  const reloadDocuments = useCallback(async () => {
    const generation = ++documentRequestGeneration.current
    if (!user || !token) {
      setDocuments([])
      setDocumentsLoading(false)
      setDocumentsError(null)
      return
    }
    setDocumentsLoading(true)
    setDocumentsError(null)
    try {
      const data = await listDocuments(token)
      if (generation === documentRequestGeneration.current) {
        setDocuments(data.map(toDomainDocument))
      }
    } catch (err) {
      if (generation === documentRequestGeneration.current) {
        setDocuments([])
        setDocumentsError(errorMessage(err))
      }
    } finally {
      if (generation === documentRequestGeneration.current) {
        setDocumentsLoading(false)
      }
    }
  }, [token, user])

  useEffect(() => {
    void reloadDocuments()
    return () => {
      documentRequestGeneration.current += 1
    }
  }, [reloadDocuments])

  useEffect(() => {
    startNewConversation()
    setUploadError(null)
  }, [startNewConversation, user?.id])

  // Polling status dokumen yang sedang diproses (queued/processing)
  useEffect(() => {
    if (!token || role !== 'admin') return
    const active = documents.filter((doc) => doc.status === 'Queued' || doc.status === 'Processing')
    if (active.length === 0) return
    let cancelled = false
    const interval = setInterval(() => {
      active.forEach((doc) => {
        getDocumentStatus(doc.id, token)
          .then((status) => {
            if (!cancelled) {
              setDocuments((current) => current.map((item) => item.id === status.id
                ? { ...item, status: toDomainDocumentStatus(status.status) }
                : item))
            }
          })
          .catch(() => { /* biarkan polling berikutnya mencoba lagi */ })
      })
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [documents, role, token])

  const registerUploadedDocument = (document: ApiDocument) => {
    const ownerId = user?.id
    if (!ownerId || activeUserId.current !== ownerId) return
    const nextDocument = toDomainDocument(document)
    setDocuments((current) => [nextDocument, ...current.filter((item) => item.id !== nextDocument.id)])
  }

  const removeDocument = async (id: string) => {
    if (!token) return false
    const ownerId = user?.id
    setUploadError(null)
    try {
      await deleteDocument(id, token)
      if (ownerId && activeUserId.current === ownerId) {
        setDocuments((current) => current.filter((doc) => doc.id !== id))
        return true
      }
      return false
    } catch (err) {
      if (ownerId && activeUserId.current === ownerId) {
        setUploadError(errorMessage(err))
      }
      return false
    }
  }

  const sendQuestion = async (q: string) => {
    if (!q.trim() || activeChatRequestGeneration.current !== null) return
    const generation = ++chatRequestGeneration.current
    activeChatRequestGeneration.current = generation
    const ownerId = user?.id ?? null
    const conversationId = currentConversationId.current
    const requestIsCurrent = () => generation === chatRequestGeneration.current
      && activeChatRequestGeneration.current === generation
      && activeUserId.current === ownerId
    setIsLoadingAnswer(true)
    setChatError(null)
    setAnswer('')
    setCitations([])
    try {
      const res = await queryChat({
        question: q,
        ...(conversationId ? { conversationId } : {}),
      }, token ?? undefined)
      if (!requestIsCurrent()) return
      currentConversationId.current = res.conversationId
      setAnswer(res.answer ?? '')
      setCitations(res.citations)
      if (!res.answer && res.message) {
        setChatError(res.message)
      }
    } catch (err) {
      if (requestIsCurrent()) {
        setChatError(errorMessage(err))
      }
    } finally {
      if (activeChatRequestGeneration.current === generation) {
        activeChatRequestGeneration.current = null
        if (generation === chatRequestGeneration.current && activeUserId.current === ownerId) {
          setIsLoadingAnswer(false)
        }
      }
    }
  }

  const onAsk = (event: FormEvent) => {
    event.preventDefault()
    void sendQuestion(question)
  }

  const askQuestion = (value: string) => {
    if (!value.trim() || activeChatRequestGeneration.current !== null) return
    setQuestion(value)
    void sendQuestion(value)
  }

  return (
    <WorkspaceContext.Provider value={{
      role,
      navigation,
      documents,
      documentsLoading,
      documentsError,
      reloadDocuments,
      question,
      setQuestion,
      answer,
      citations,
      isLoadingAnswer,
      chatError,
      onAsk,
      askQuestion,
      startNewConversation,
      uploadError,
      registerUploadedDocument,
      removeDocument,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}
