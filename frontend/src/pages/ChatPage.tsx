import { ArrowUpRight, Send, Sparkles } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { SourceCard } from '@/components/SourceCard'
import { useWorkspace } from '@/hooks/useWorkspace'
import { quickQuestions } from '@/types/domain'

export function ChatPage() {
  const { question, setQuestion, answer, onAsk, askQuestion } = useWorkspace()
  return (
    <div className="chat-page">
      <PageHeading eyebrow="AI assistant" title="Ask with confidence" detail="Every answer stays linked to its source." />
      <div className="chat-canvas">
        {answer ? <div className="conversation">
          <div className="user-message">{question || quickQuestions[0]}</div>
          <div className="assistant-message">
            <div className="answer-label"><Sparkles size={16} /> JCP AI</div>
            <p>{answer}</p>
            <SourceCard title="SOP Perjalanan Dinas 2026" detail="Page 7 · Hotel allowance" trailing={<ArrowUpRight size={15} />} />
          </div>
        </div> : <div className="chat-empty">
          <span><Sparkles size={27} /></span>
          <h2>What would you like to know?</h2>
          <p>Ask across policies, SOPs, handbooks, and internal documents.</p>
          <div>{quickQuestions.slice(0, 2).map((item) => <button key={item} onClick={() => askQuestion(item)}>{item}</button>)}</div>
        </div>}
      </div>
      <form className="chat-composer" onSubmit={onAsk}>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about your company knowledge" />
        <button title="Send question"><Send size={18} /></button>
      </form>
    </div>
  )
}
