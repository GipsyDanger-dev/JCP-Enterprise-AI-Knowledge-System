import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowUpRight, FileText, Loader2, MessageSquareText, Plus, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { SourceCard } from '@/components/SourceCard'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { getDocumentBlob, getDocumentChunks } from '@/api/documents'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { quickQuestions } from '@/types/domain'
import type { ChatMessage } from '@/context/workspaceContextValue'

type Citation = ChatMessage['citations'][number]

const COMMON_QUERY_WORDS = new Set(['yang', 'dengan', 'untuk', 'dalam', 'tentang', 'pada', 'dari', 'atau', 'dan', 'saya', 'kami', 'bisa', 'bagaimana', 'berapa', 'apakah', 'tolong', 'dokumen', 'perusahaan'])

function formatEvidencePreview(excerpt: string, question: string | null) {
  const normalized = excerpt
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const firstSection = normalized.search(/\b1\.\s+[A-Z][A-Z\s]{2,}(?=\s)/)
  const content = (firstSection >= 0 ? normalized.slice(firstSection) : normalized).trim()
  const sections = content
    .split(/(?=\b\d+\.\s+[A-Z][A-Z\s]{2,}(?=\s))/)
    .map((section) => section.trim())
    .filter(Boolean)
  const keywords = (question ?? '').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)?.filter((word) => !COMMON_QUERY_WORDS.has(word)) ?? []
  const ranked = sections
    .map((section, index) => ({
      section,
      index,
      score: keywords.reduce((score, word) => score + (section.toLowerCase().includes(word) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(2, sections.length))
    .map(({ section }) => section.length > 520 ? `${section.slice(0, 520).trimEnd()}...` : section)
  return (ranked.length > 0 ? ranked : [content.slice(0, 720)]).join('\n\n')
}

function ChatMessageItem({ msg, isId, isPending, onOpenSource, onSuggestion }: { msg: ChatMessage; isId: boolean; isPending: boolean; onOpenSource: (citation: Citation, question: string) => void; onSuggestion: (value: string) => void }) {
  return (
    <>
      <div className="user-message">{msg.question}</div>
      {isPending && !msg.answer && !msg.error && (
        <div className="assistant-message loading">
          <div className="answer-label"><Loader2 size={16} className="spin" /> Enterprise AI</div>
          <p className="typing-indicator">{isId ? 'Mencari basis pengetahuan…' : 'Searching knowledge base…'}</p>
        </div>
      )}
      {!isPending && msg.error && !msg.answer && (
        <div className="assistant-message no-answer">
          <div className="answer-label"><AlertTriangle size={16} /> Enterprise AI</div>
          <p>{msg.error}</p>
          {msg.suggestions.length > 0 && <SuggestionList suggestions={msg.suggestions} onSelect={onSuggestion} />}
        </div>
      )}
      {msg.answer && (
        <div className="assistant-message">
          <div className="answer-label"><Sparkles size={16} /> Enterprise AI</div>
          <div className="answer-copy">{renderAnswer(msg.answer)}</div>
          {msg.suggestions.length > 0 && <SuggestionList suggestions={msg.suggestions} onSelect={onSuggestion} />}
          {msg.citations.length > 0 && (
            <div className="citations">
              {msg.citations.map((c, i) => (
                <SourceCard
                  key={`${c.documentId}-${c.chunkId}-${i}`}
                  title={c.filename}
                  detail={[c.sectionTitle, c.pageNumber ? `Page ${c.pageNumber}` : null, c.version].filter(Boolean).join(' · ')}
                  excerpt={c.excerpt}
                  trailing={<ArrowUpRight size={15} />}
                  onOpen={() => onOpenSource(c, msg.question)}
                />
              ))}
            </div>
          )}
          {/* Ikut syarat kartu sumber di atas: tanpa kutipan tidak ada bukti
              yang bisa diklaim terverifikasi. */}
          {msg.citations.length > 0 && <VerifiedBadge />}
        </div>
      )}
    </>
  )
}

function renderAnswer(answer: string) {
  return answer.split(/\r?\n/).map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    return (
      <div key={`${lineIndex}-${line}`} className={line.trim() === '' ? 'answer-blank' : undefined}>
        {parts.map((part, partIndex) => part.startsWith('**') && part.endsWith('**')
          ? <strong key={partIndex}>{part.slice(2, -2)}</strong>
          : <span key={partIndex}>{part}</span>)}
      </div>
    )
  })
}

function SuggestionList({ suggestions, onSelect }: { suggestions: string[]; onSelect: (value: string) => void }) {
  return (
    <div className="chat-suggestions">
      <span>Coba tanyakan:</span>
      <div>
        {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => onSelect(suggestion)}>{suggestion}</button>)}
      </div>
    </div>
  )
}

export function ChatPage() {
  const { token } = useAuth()
  const { question, setQuestion, chatHistory, clearChat, isLoadingAnswer, onAsk, askQuestion, language, documents } = useWorkspace()
  const hasConversation = chatHistory.length > 0 || isLoadingAnswer
  const isId = language === 'id'
  const bottomRef = useRef<HTMLDivElement>(null)
  const [selectedSource, setSelectedSource] = useState<Citation | null>(null)
  const [selectedSourceQuestion, setSelectedSourceQuestion] = useState<string | null>(null)
  const [sourcePreviewText, setSourcePreviewText] = useState<string | null>(null)
  const [sourcePreviewLoading, setSourcePreviewLoading] = useState(false)
  const [sourcePdfUrl, setSourcePdfUrl] = useState<string | null>(null)
  const [sourcePdfLoading, setSourcePdfLoading] = useState(false)

  useEffect(() => {
    if (!selectedSource) {
      setSourcePreviewText(null)
      setSourcePdfUrl(null)
      setSelectedSourceQuestion(null)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    const isPdf = selectedSource.filename.toLowerCase().endsWith('.pdf')

    setSourcePdfUrl(null)
    setSourcePreviewText(selectedSource.excerpt ?? null)

    if (isPdf) {
      setSourcePdfLoading(true)
      getDocumentBlob(selectedSource.documentId, token ?? undefined)
        .then((blob) => {
          objectUrl = URL.createObjectURL(blob)
          if (!cancelled) setSourcePdfUrl(`${objectUrl}#page=${selectedSource.pageNumber ?? 1}`)
        })
        .catch(() => { if (!cancelled) setSourcePdfUrl(null) })
        .finally(() => { if (!cancelled) setSourcePdfLoading(false) })
    }

    if (selectedSource.excerpt) {
      return () => {
        cancelled = true
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    }
    setSourcePreviewLoading(true)
    getDocumentChunks(selectedSource.documentId, token ?? undefined)
      .then((result) => {
        if (!cancelled) {
          setSourcePreviewText(result.chunks.find((chunk) => chunk.chunkId === selectedSource.chunkId)?.text ?? null)
        }
      })
      .catch(() => { if (!cancelled) setSourcePreviewText(null) })
      .finally(() => { if (!cancelled) setSourcePreviewLoading(false) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [selectedSource, token])

  const evidencePreview = sourcePreviewText ? formatEvidencePreview(sourcePreviewText, selectedSourceQuestion) : null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isLoadingAnswer])

  return (
    <div className="chat-page">
      <div className="chat-workspace-header">
        <PageHeading
          eyebrow={isId ? 'Asisten AI' : 'AI assistant'}
          title={isId ? 'Knowledge workspace' : 'Knowledge workspace'}
          detail={isId ? 'Jawaban berbasis dokumen perusahaan.' : 'Answers grounded in company documents.'}
          action={hasConversation ? (
            <button
              type="button"
              className="secondary-button"
              onClick={clearChat}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={15} /> {isId ? 'Chat baru' : 'New chat'}
            </button>
          ) : undefined}
        />
        <div className="chat-trust-status">
          <ShieldCheck size={16} />
          <span>{isId ? 'Sumber terverifikasi' : 'Verified sources'}</span>
        </div>
      </div>
      <div className={`chat-canvas ${hasConversation ? 'has-history' : ''}`}>
        {hasConversation ? (
          <div className="conversation">
            {chatHistory.map((msg, index) => (
              <ChatMessageItem key={msg.id} msg={msg} isId={isId} isPending={isLoadingAnswer && index === chatHistory.length - 1} onOpenSource={(citation, sourceQuestion) => { setSelectedSourceQuestion(sourceQuestion); setSelectedSource(citation) }} onSuggestion={askQuestion} />
            ))}

            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="chat-empty">
            <span><MessageSquareText size={24} /></span>
            <h2>{isId ? 'Apa yang ingin Anda ketahui?' : 'What would you like to know?'}</h2>
            <p>{isId ? 'Tanyakan tentang kebijakan, SOP, handbooks, dan dokumen internal.' : 'Ask across policies, SOPs, handbooks, and internal documents.'}</p>
            <div>{quickQuestions(language, documents).slice(0, 2).map((item) => (
              <button key={item} onClick={() => askQuestion(item)}>{item}</button>
            ))}</div>
          </div>
        )}
      </div>
      <form className="chat-composer" onSubmit={onAsk}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={isId ? 'Ajukan pertanyaan tentang pengetahuan perusahaan Anda' : 'Ask a question about your company knowledge'}
          disabled={isLoadingAnswer}
        />
        <button title={isId ? 'Kirim pertanyaan' : 'Send question'} disabled={isLoadingAnswer || !question.trim()}>
          {isLoadingAnswer ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
        </button>
      </form>
      {selectedSource && (
        <div className="source-preview-backdrop" role="presentation" onClick={() => setSelectedSource(null)}>
          <section className="source-preview" role="dialog" aria-modal="true" aria-label="Source preview" onClick={(event) => event.stopPropagation()}>
            <header>
              <span><FileText size={18} /> {isId ? 'Sumber jawaban' : 'Answer source'}</span>
              <button type="button" className="icon-button" title="Close" onClick={() => { setSelectedSourceQuestion(null); setSelectedSource(null) }}><X size={18} /></button>
            </header>
            <strong>{selectedSource.filename}</strong>
            <small>{[selectedSource.sectionTitle, selectedSource.pageNumber ? `Page ${selectedSource.pageNumber}` : null, selectedSource.version].filter(Boolean).join(' · ')}</small>
            {sourcePdfLoading && <div className="source-preview-loading">{isId ? 'Memuat PDF asli...' : 'Loading original PDF...'}</div>}
            {sourcePdfUrl ? (
              <div className="source-preview-pdf">
                <div className="source-preview-evidence">
                  <span>{isId ? 'Bukti yang digunakan untuk jawaban' : 'Evidence used for this answer'}</span>
                  <mark>{evidencePreview || (isId ? 'Cuplikan citation tidak tersedia.' : 'Citation excerpt is unavailable.')}</mark>
                </div>
                <iframe title={`${selectedSource.filename} page ${selectedSource.pageNumber ?? 1}`} src={sourcePdfUrl} />
              </div>
            ) : (
              <blockquote>{sourcePreviewLoading ? (isId ? 'Memuat cuplikan...' : 'Loading excerpt...') : evidencePreview || (isId ? 'Cuplikan tidak tersedia untuk sumber ini.' : 'No excerpt is available for this source.')}</blockquote>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
