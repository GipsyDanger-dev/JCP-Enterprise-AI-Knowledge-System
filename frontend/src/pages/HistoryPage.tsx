import { ArrowUpRight, MessageSquareText, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeading } from '@/components/PageHeading'
import { useWorkspace } from '@/hooks/useWorkspace'

interface Conversation {
  id: number
  title: string
  preview: string
  sources: number
  time: string
}

const CONVERSATIONS_EN: Conversation[] = [
  { id: 1, title: 'Hotel allowance for managers', preview: 'Based on SOP Perjalanan Dinas 2026, the hotel allowance for managers is...', sources: 2, time: '18 minutes ago' },
  { id: 2, title: 'Procurement approval flow', preview: 'The procurement approval flow requires 3 levels of approval...', sources: 1, time: '2 hours ago' },
  { id: 3, title: 'Annual leave carry over policy', preview: 'According to the Employee Handbook, annual leave can be carried over...', sources: 3, time: 'Yesterday' },
  { id: 4, title: 'IT security policy for contractors', preview: 'Contractors are required to follow the Information Security Policy...', sources: 2, time: '2 days ago' },
  { id: 5, title: 'Reimbursement process', preview: 'The reimbursement process requires submitting a claim form with receipts...', sources: 1, time: '3 days ago' },
]

const CONVERSATIONS_ID: Conversation[] = [
  { id: 1, title: 'Tunjangan hotel untuk manajer', preview: 'Berdasarkan SOP Perjalanan Dinas 2026, tunjangan hotel untuk manajer adalah...', sources: 2, time: '18 menit lalu' },
  { id: 2, title: 'Alur persetujuan procurement', preview: 'Alur persetujuan procurement memerlukan 3 tingkat persetujuan...', sources: 1, time: '2 jam lalu' },
  { id: 3, title: 'Kebijakan penangguhan cuti tahunan', preview: 'Menurut Employee Handbook, cuti tahunan dapat ditangguhkan...', sources: 3, time: 'Kemarin' },
  { id: 4, title: 'Kebijakan keamanan IT untuk kontraktor', preview: 'Kontraktor diharuskan mengikuti Kebijakan Keamanan Informasi...', sources: 2, time: '2 hari lalu' },
  { id: 5, title: 'Proses reimbursement', preview: 'Proses reimbursement memerlukan pengiriman formulir klaim dengan tanda terima...', sources: 1, time: '3 hari lalu' },
]

export function HistoryPage() {
  const navigate = useNavigate()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const CONVERSATIONS = isId ? CONVERSATIONS_ID : CONVERSATIONS_EN

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow={isId ? 'Asisten AI' : 'AI assistant'}
        title={isId ? 'Riwayat percakapan' : 'Conversation history'}
        detail={isId ? 'Pertanyaan dan jawaban masa lalu Anda dari Enterprise AI.' : 'Your past questions and answers from Enterprise AI.'}
        action={
          <button className="primary-button" onClick={() => navigate('/chat')}>
            <MessageSquareText size={17} /> {isId ? 'Pertanyaan baru' : 'New question'}
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
              <small>{conv.sources} {isId ? 'sumber dikutip' : 'source' + (conv.sources !== 1 ? 's' : '') + ' cited'}</small>
            </div>
            <ArrowUpRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 4 }} />
          </button>
        ))}
      </div>
    </div>
  )
}
