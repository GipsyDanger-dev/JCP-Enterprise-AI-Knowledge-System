import { ArrowUpRight, MessageSquareText, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeading } from '@/components/PageHeading'

interface Conversation {
  id: number
  title: string
  preview: string
  sources: number
  time: string
}

const CONVERSATIONS: Conversation[] = [
  { id: 1, title: 'Hotel allowance for managers', preview: 'Based on SOP Perjalanan Dinas 2026, the hotel allowance for managers is...', sources: 2, time: '18 minutes ago' },
  { id: 2, title: 'Procurement approval flow', preview: 'The procurement approval flow requires 3 levels of approval...', sources: 1, time: '2 hours ago' },
  { id: 3, title: 'Annual leave carry over policy', preview: 'According to the Employee Handbook, annual leave can be carried over...', sources: 3, time: 'Yesterday' },
  { id: 4, title: 'IT security policy for contractors', preview: 'Contractors are required to follow the Information Security Policy...', sources: 2, time: '2 days ago' },
  { id: 5, title: 'Reimbursement process', preview: 'The reimbursement process requires submitting a claim form with receipts...', sources: 1, time: '3 days ago' },
]

export function HistoryPage() {
  const navigate = useNavigate()

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow="AI assistant"
        title="Conversation history"
        detail="Your past questions and answers from Enterprise AI."
        action={
          <button className="primary-button" onClick={() => navigate('/chat')}>
            <MessageSquareText size={17} /> New question
          </button>
        }
      />

      <div className="conversation-list">
        {CONVERSATIONS.map((conv) => (
          <button key={conv.id} className="conversation-card" onClick={() => navigate('/chat')}>
            <span className="conversation-icon"><Sparkles size={16} /></span>
            <div>
              <strong>{conv.title}</strong>
              <small>{conv.time}</small>
              <p>{conv.preview}</p>
              <small>{conv.sources} source{conv.sources !== 1 ? 's' : ''} cited</small>
            </div>
            <ArrowUpRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 4 }} />
          </button>
        ))}
      </div>
    </div>
  )
}
