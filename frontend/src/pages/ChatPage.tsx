import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowUpRight, FileText, Loader2, Send, Sparkles, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { SourceCard } from '@/components/SourceCard'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { useWorkspace } from '@/hooks/useWorkspace'
import { quickQuestions } from '@/types/domain'
import type { ChatMessage } from '@/context/workspaceContextValue'

type Citation = ChatMessage['citations'][number]

function ChatMessageItem({ msg, isId, isPending, onOpenSource }: { msg: ChatMessage; isId: boolean; isPending: boolean; onOpenSource: (citation: Citation) => void }) {
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
        </div>
      )}
      {msg.answer && (
        <div className="assistant-message">
          <div className="answer-label"><Sparkles size={16} /> Enterprise AI</div>
          <p>{msg.answer}</p>
          {msg.citations.length > 0 && (
            <div className="citations">
              {msg.citations.map((c, i) => (
                <SourceCard
                  key={`${c.documentId}-${c.chunkId}-${i}`}
                  title={c.filename}
                  detail={[c.sectionTitle, c.pageNumber ? `Page ${c.pageNumber}` : null, c.version].filter(Boolean).join(' · ')}
                  excerpt={c.excerpt}
                  trailing={<ArrowUpRight size={15} />}
                  onOpen={() => onOpenSource(c)}
                />
              ))}
            </div>
          )}
          <VerifiedBadge />
        </div>
      )}
    </>
  )
}

export function ChatPage() {
  const { question, setQuestion, chatHistory, isLoadingAnswer, onAsk, askQuestion, language } = useWorkspace()
  const hasConversation = chatHistory.length > 0 || isLoadingAnswer
  const isId = language === 'id'
  const bottomRef = useRef<HTMLDivElement>(null)
  const [selectedSource, setSelectedSource] = useState<Citation | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isLoadingAnswer])

  return (
    <div className="chat-page">
      <PageHeading eyebrow={isId ? 'Asisten AI' : 'AI assistant'} title={isId ? 'Tanyakan dengan percaya diri' : 'Ask with confidence'} detail={isId ? 'Setiap jawaban tetap terhubung ke sumbernya.' : 'Every answer stays linked to its source.'} />
      <div className={`chat-canvas ${hasConversation ? 'has-history' : ''}`}>
        {hasConversation ? (
          <div className="conversation">
            {chatHistory.map((msg, index) => (
              <ChatMessageItem key={msg.id} msg={msg} isId={isId} isPending={isLoadingAnswer && index === chatHistory.length - 1} onOpenSource={setSelectedSource} />
            ))}

            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="chat-empty">
            <span><Sparkles size={27} /></span>
            <h2>{isId ? 'Apa yang ingin Anda ketahui?' : 'What would you like to know?'}</h2>
            <p>{isId ? 'Tanyakan tentang kebijakan, SOP, handbooks, dan dokumen internal.' : 'Ask across policies, SOPs, handbooks, and internal documents.'}</p>
            <div>{quickQuestions(language).slice(0, 2).map((item) => (
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
              <button type="button" className="icon-button" title="Close" onClick={() => setSelectedSource(null)}><X size={18} /></button>
            </header>
            <strong>{selectedSource.filename}</strong>
            <small>{[selectedSource.sectionTitle, selectedSource.pageNumber ? `Page ${selectedSource.pageNumber}` : null, selectedSource.version].filter(Boolean).join(' · ')}</small>
            <blockquote>{selectedSource.excerpt || (isId ? 'Cuplikan tidak tersedia untuk sumber ini.' : 'No excerpt is available for this source.')}</blockquote>
          </section>
        </div>
      )}
    </div>
  )
}
