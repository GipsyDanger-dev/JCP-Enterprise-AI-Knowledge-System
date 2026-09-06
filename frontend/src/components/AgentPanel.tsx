import { AlertTriangle, Bot, ChevronRight, Loader2, MoreHorizontal, Send, Sparkles } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { quickQuestions } from '@/types/domain'
import { SourceCard } from './SourceCard'
import { VerifiedBadge } from './VerifiedBadge'

export function AgentPanel() {
  const { question, setQuestion, chatHistory, isLoadingAnswer, awaitingChoice, onAsk, askQuestion, language, documents } = useWorkspace()
  const latestMessage = chatHistory[chatHistory.length - 1]
  const hasConversation = Boolean(latestMessage) || isLoadingAnswer
  const isId = language === 'id'

  return (
    <aside className="agent-panel">
      <div className="agent-header">
        <div><span className="agent-icon"><Sparkles size={17} /></span><div><strong>{isId ? 'Agen Pengetahuan' : 'Knowledge Agent'}</strong><small>{isId ? 'Berbasis ruang kerja Anda' : 'Grounded in your workspace'}</small></div></div>
        <MoreHorizontal size={18} />
      </div>
      <div className="agent-body">
        {!hasConversation ? (
          <>
            <div className="agent-intro"><span><Bot size={24} /></span><h2>{isId ? 'Tanyakan pengetahuan perusahaan' : 'Ask company knowledge'}</h2><p>{isId ? 'Jawaban menyertakan bukti dokumen yang digunakan.' : 'Answers include the exact document evidence used.'}</p></div>
            <div className="question-list">{quickQuestions(language, documents).map((item) => (
              <button key={item} onClick={() => askQuestion(item)}>{item}<ChevronRight size={15} /></button>
            ))}</div>
          </>
        ) : (
          <div className="agent-answer">
            {isLoadingAnswer && (
              <>
                <div className="answer-label"><Loader2 size={16} className="spin" /> Enterprise AI</div>
                <p className="typing-indicator">{isId ? 'Mencari basis pengetahuan…' : 'Searching knowledge base…'}</p>
              </>
            )}

            {!isLoadingAnswer && latestMessage?.error && !latestMessage.answer && (
              <>
                <div className="answer-label"><AlertTriangle size={16} /> Enterprise AI</div>
                <p>{latestMessage.error}</p>
              </>
            )}

            {!isLoadingAnswer && latestMessage?.answer && (
              <>
                <div className="answer-label"><Sparkles size={16} /> Enterprise AI</div>
                <p>{latestMessage.answer}</p>
                {latestMessage.citations.length > 0 && latestMessage.citations.map((c, i) => (
                  <SourceCard
                    key={`${c.documentId}-${c.chunkId}-${i}`}
                    title={c.filename}
                    detail={[c.sectionTitle, c.pageNumber ? `Page ${c.pageNumber}` : null, c.version].filter(Boolean).join(' · ')}
                  />
                ))}
                {/* Ikut syarat kartu sumber di atas: tanpa kutipan tidak ada
                    bukti yang bisa diklaim terverifikasi. */}
                {latestMessage.citations.length > 0 && <VerifiedBadge />}
              </>
            )}
          </div>
        )}
      </div>
      <form className="agent-composer" onSubmit={onAsk}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={awaitingChoice
            ? (isId ? 'Pilih salah satu pertanyaan di atas untuk melanjutkan' : 'Pick one of the questions above to continue')
            : (isId ? 'Tanyakan apa saja tentang ruang kerja Anda' : 'Ask anything about your workspace')}
          aria-label={isId ? 'Tanyakan ke agen pengetahuan' : 'Ask the knowledge agent'}
          disabled={isLoadingAnswer || awaitingChoice}
        />
        <button title={isId ? 'Kirim pertanyaan' : 'Send question'} disabled={isLoadingAnswer || awaitingChoice || !question.trim()}>
          {isLoadingAnswer ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
        </button>
      </form>
    </aside>
  )
}
