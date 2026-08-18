import { AlertTriangle, ArrowUpRight, Loader2, Send, Sparkles } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { SourceCard } from '@/components/SourceCard'
import { useWorkspace } from '@/hooks/useWorkspace'
import { quickQuestions } from '@/types/domain'

export function ChatPage() {
  const { question, setQuestion, answer, citations, isLoadingAnswer, chatError, onAsk, askQuestion } = useWorkspace()
  const hasConversation = answer || chatError || isLoadingAnswer

  return (
    <div className="chat-page">
      <PageHeading eyebrow="AI assistant" title="Ask with confidence" detail="Every answer stays linked to its source." />
      <div className="chat-canvas">
        {hasConversation ? (
          <div className="conversation">
            <div className="user-message">{question}</div>

            {isLoadingAnswer && (
              <div className="assistant-message loading">
                <div className="answer-label"><Loader2 size={16} className="spin" /> Enterprise AI</div>
                <p className="typing-indicator">Searching knowledge base…</p>
              </div>
            )}

            {!isLoadingAnswer && chatError && !answer && (
              <div className="assistant-message no-answer">
                <div className="answer-label"><AlertTriangle size={16} /> Enterprise AI</div>
                <p>{chatError}</p>
              </div>
            )}

            {!isLoadingAnswer && answer && (
              <div className="assistant-message">
                <div className="answer-label"><Sparkles size={16} /> Enterprise AI</div>
                <p>{answer}</p>
                {citations.length > 0 && (
                  <div className="citations">
                    {citations.map((c, i) => (
                      <SourceCard
                        key={`${c.documentId}-${c.chunkId}-${i}`}
                        title={c.filename}
                        detail={[c.sectionTitle, c.pageNumber ? `Page ${c.pageNumber}` : null, c.version].filter(Boolean).join(' · ')}
                        trailing={<ArrowUpRight size={15} />}
                      />
                    ))}
                  </div>
                )}
                <div className="verified">✓ Evidence verified</div>
              </div>
            )}
          </div>
        ) : (
          <div className="chat-empty">
            <span><Sparkles size={27} /></span>
            <h2>What would you like to know?</h2>
            <p>Ask across policies, SOPs, handbooks, and internal documents.</p>
            <div>{quickQuestions.slice(0, 2).map((item) => (
              <button key={item} onClick={() => askQuestion(item)}>{item}</button>
            ))}</div>
          </div>
        )}
      </div>
      <form className="chat-composer" onSubmit={onAsk}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask a question about your company knowledge"
          disabled={isLoadingAnswer}
        />
        <button title="Send question" disabled={isLoadingAnswer || !question.trim()}>
          {isLoadingAnswer ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  )
}
