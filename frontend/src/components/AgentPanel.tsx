import { Bot, ChevronRight, MoreHorizontal, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { quickQuestions } from '@/types/domain'
import { SourceCard } from './SourceCard'

export function AgentPanel() {
  const { question, setQuestion, answer, onAsk, askQuestion } = useWorkspace()
  return (
    <aside className="agent-panel">
      <div className="agent-header">
        <div><span className="agent-icon"><Sparkles size={17} /></span><div><strong>Knowledge Agent</strong><small>Grounded in your workspace</small></div></div>
        <MoreHorizontal size={18} />
      </div>
      <div className="agent-body">
        {!answer ? <>
          <div className="agent-intro"><span><Bot size={24} /></span><h2>Ask company knowledge</h2><p>Answers include the exact document evidence used.</p></div>
          <div className="question-list">{quickQuestions.map((item) => <button key={item} onClick={() => askQuestion(item)}>{item}<ChevronRight size={15} /></button>)}</div>
        </> : <div className="agent-answer">
          <div className="answer-label"><Bot size={16} /> Enterprise AI</div>
          <p>{answer}</p>
          <SourceCard title="SOP Perjalanan Dinas 2026" detail="Page 7 · Hotel allowance" />
          <div className="verified"><ShieldCheck size={15} /> Evidence verified</div>
        </div>}
      </div>
      <form className="agent-composer" onSubmit={onAsk}>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask anything about your workspace" aria-label="Ask the knowledge agent" />
        <button title="Send question"><Send size={17} /></button>
      </form>
    </aside>
  )
}
