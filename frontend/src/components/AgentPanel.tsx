import { AlertTriangle, Bot, ChevronRight, Loader2, MoreHorizontal, Send, Sparkles } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { quickQuestions } from '@/types/domain'
import { SourceCard } from './SourceCard'
import { VerifiedBadge } from './VerifiedBadge'

export function AgentPanel() {
  const { question, setQuestion, answer, citations, isLoadingAnswer, chatError, onAsk, askQuestion } = useWorkspace()
  const hasConversation = answer || chatError || isLoadingAnswer

  return (
    <aside className="agent-panel">
      <div className="agent-header">
        <div><span className="agent-icon"><Sparkles size={17} /></span><div><strong>Knowledge Agent</strong><small>Grounded in your workspace</small></div></div>
        <MoreHorizontal size={18} />
      </div>
      <div className="agent-body">
        {!hasConversation ? (
          <>
            <div className="agent-intro"><span><Bot size={24} /></span><h2>Ask company knowledge</h2><p>Answers include the exact document evidence used.</p></div>
            <div className="question-list">{quickQuestions.map((item) => (
              <button key={item} onClick={() => askQuestion(item)}>{item}<ChevronRight size={15} /></button>
            ))}</div>
          </>
        ) : (
          <div className="agent-answer">
            {isLoadingAnswer && (
              <>
                <div className="answer-label"><Loader2 size={16} className="spin" /> Enterprise AI</div>
                <p className="typing-indicator">Searching knowledge base…</p>
              </>
            )}

            {!isLoadingAnswer && chatError && !answer && (
              <>
                <div className="answer-label"><AlertTriangle size={16} /> Enterprise AI</div>
                <p>{chatError}</p>
              </>
            )}

            {!isLoadingAnswer && answer && (
              <>
                <div className="answer-label"><Sparkles size={16} /> Enterprise AI</div>
                <p>{answer}</p>
                {citations.length > 0 && citations.map((c, i) => (
                  <SourceCard
                    key={`${c.documentId}-${c.chunkId}-${i}`}
                    title={c.filename}
                    detail={[c.sectionTitle, c.pageNumber ? `Page ${c.pageNumber}` : null, c.version].filter(Boolean).join(' · ')}
                  />
                ))}
                <VerifiedBadge />
              </>
            )}
          </div>
        )}
      </div>
      <form className="agent-composer" onSubmit={onAsk}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask anything about your workspace"
          aria-label="Ask the knowledge agent"
          disabled={isLoadingAnswer}
        />
        <button title="Send question" disabled={isLoadingAnswer || !question.trim()}>
          {isLoadingAnswer ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
        </button>
      </form>
    </aside>
  )
}
