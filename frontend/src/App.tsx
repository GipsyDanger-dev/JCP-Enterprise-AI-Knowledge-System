import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode, RefObject } from 'react'
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react'

type View = 'overview' | 'documents' | 'chat' | 'users'
type DocumentStatus = 'Ready' | 'Processing' | 'Queued'

type DocumentItem = {
  id: number
  name: string
  collection: string
  updatedAt: string
  status: DocumentStatus
  chunks: number | null
}

const initialDocuments: DocumentItem[] = [
  { id: 1, name: 'SOP Perjalanan Dinas 2026.pdf', collection: 'Operations', updatedAt: '18 Aug, 10:42', status: 'Ready', chunks: 42 },
  { id: 2, name: 'Kebijakan Keamanan Informasi.docx', collection: 'IT & Security', updatedAt: '18 Aug, 09:16', status: 'Ready', chunks: 28 },
  { id: 3, name: 'Panduan Procurement.pdf', collection: 'Finance', updatedAt: '17 Aug, 16:30', status: 'Processing', chunks: null },
  { id: 4, name: 'Employee Handbook 2026.pdf', collection: 'People', updatedAt: '16 Aug, 13:05', status: 'Ready', chunks: 61 },
]

const navigation = [
  { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
  { id: 'documents' as const, label: 'Documents', icon: FolderOpen },
  { id: 'chat' as const, label: 'AI Assistant', icon: MessageSquareText },
  { id: 'users' as const, label: 'People & access', icon: Users },
]

const quickQuestions = [
  'What is the hotel allowance for managers?',
  'Summarize our procurement approval flow',
  'Which security policy applies to contractors?',
]

export default function App() {
  const [view, setView] = useState<View>('overview')
  const [documents, setDocuments] = useState(initialDocuments)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)

  const openView = (nextView: View) => {
    setView(nextView)
    setMenuOpen(false)
  }

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setDocuments((current) => [{
      id: Date.now(),
      name: file.name,
      collection: 'Unassigned',
      updatedAt: 'Just now',
      status: 'Queued',
      chunks: null,
    }, ...current])
    event.target.value = ''
  }

  const handleAsk = (event: FormEvent) => {
    event.preventDefault()
    if (!question.trim()) return
    setAnswer('Manager-level hotel expenses are capped at Rp900,000 per night. The policy requires an itemized receipt and prior approval for exceptions.')
  }

  const askQuestion = (value: string) => {
    setQuestion(value)
    setAnswer('Manager-level hotel expenses are capped at Rp900,000 per night. The policy requires an itemized receipt and prior approval for exceptions.')
  }

  return (
    <main className="app-shell">
      <div className="announcement"><span>New</span> Evidence review is now available for every AI answer.</div>
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand-lockup"><span className="brand-mark"><Sparkles size={17} /></span><strong>JCP AI</strong></div>
        <button className="mobile-close" title="Close navigation" onClick={() => setMenuOpen(false)}><X size={20} /></button>
        <div className="workspace-switcher"><span>JC</span><div><strong>Jogja Creative</strong><small>Enterprise workspace</small></div><ChevronDown size={15} /></div>
        <nav aria-label="Primary navigation">
          <p>Workspace</p>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => openView(id)}>
              <Icon size={18} /><span>{label}</span>{view === id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-lower">
          <button className="nav-item"><CircleHelp size={18} /><span>Help center</span></button>
          <button className="nav-item"><Settings size={18} /><span>Settings</span></button>
          <div className="profile-row"><span className="avatar">AR</span><div><strong>Adam</strong><small>Workspace admin</small></div><MoreHorizontal size={17} /></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="menu-button" title="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="search-shell"><Search size={17} /><input aria-label="Search workspace" placeholder="Search documents, answers, or people" /></div>
          <div className="top-actions"><button className="icon-button" title="Notifications"><Bell size={18} /><span className="notification-dot" /></button><button className="top-profile"><span className="avatar small">AR</span><ChevronDown size={14} /></button></div>
        </header>

        <div className="page-content">
          {view === 'overview' && <Overview documents={documents} openView={openView} uploadRef={uploadRef} onUpload={handleUpload} question={question} setQuestion={setQuestion} answer={answer} onAsk={handleAsk} askQuestion={askQuestion} />}
          {view === 'documents' && <DocumentsPage documents={documents} uploadRef={uploadRef} onUpload={handleUpload} />}
          {view === 'chat' && <ChatPage question={question} setQuestion={setQuestion} answer={answer} onAsk={handleAsk} askQuestion={askQuestion} />}
          {view === 'users' && <UsersPage />}
        </div>
      </section>
    </main>
  )
}

function Overview({ documents, openView, uploadRef, onUpload, question, setQuestion, answer, onAsk, askQuestion }: {
  documents: DocumentItem[]
  openView: (view: View) => void
  uploadRef: RefObject<HTMLInputElement | null>
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void
  question: string
  setQuestion: (value: string) => void
  answer: string
  onAsk: (event: FormEvent) => void
  askQuestion: (value: string) => void
}) {
  const readyCount = documents.filter((document) => document.status === 'Ready').length
  return (
    <div className="overview-layout">
      <section className="overview-main">
        <PageHeading eyebrow="Tuesday, 18 August" title={<>Good morning, <span>Adam.</span></>} detail="Your company knowledge is up to date and ready to use." action={<><button className="secondary-button" onClick={() => openView('chat')}><MessageSquareText size={17} /> Ask AI</button><button className="primary-button" onClick={() => uploadRef.current?.click()}><Upload size={17} /> Upload</button><input ref={uploadRef} className="visually-hidden" type="file" accept=".pdf,.docx" onChange={onUpload} /></>} />
        <div className="metrics-grid">
          <Metric icon={FileText} value={readyCount} label="Ready documents" note="+2 this week" />
          <Metric icon={Database} value="131" label="Indexed chunks" note="Across 4 collections" />
          <Metric icon={MessageSquareText} value="24" label="Questions answered" note="92% with evidence" />
        </div>

        <section className="activity-section">
          <SectionHeading title="Knowledge activity" detail="Latest changes across your workspace" action={<button className="link-button" onClick={() => openView('documents')}>View all <ArrowUpRight size={15} /></button>} />
          <div className="activity-list">
            {documents.slice(0, 4).map((document) => <DocumentActivity key={document.id} document={document} />)}
          </div>
        </section>

        <section className="collection-section">
          <SectionHeading title="Collections" detail="Organized sources available to your team" />
          <div className="collection-grid">
            <Collection name="Operations" count="18 documents" color="orange" />
            <Collection name="IT & Security" count="12 documents" color="mint" />
            <Collection name="People" count="9 documents" color="violet" />
          </div>
        </section>
      </section>

      <AgentPanel question={question} setQuestion={setQuestion} answer={answer} onAsk={onAsk} askQuestion={askQuestion} />
    </div>
  )
}

function AgentPanel({ question, setQuestion, answer, onAsk, askQuestion }: { question: string; setQuestion: (value: string) => void; answer: string; onAsk: (event: FormEvent) => void; askQuestion: (value: string) => void }) {
  return <aside className="agent-panel">
    <div className="agent-header"><div><span className="agent-icon"><Sparkles size={17} /></span><div><strong>Knowledge Agent</strong><small>Grounded in your workspace</small></div></div><MoreHorizontal size={18} /></div>
    <div className="agent-body">
      {!answer ? <><div className="agent-intro"><span><Bot size={24} /></span><h2>Ask company knowledge</h2><p>Answers include the exact document evidence used.</p></div><div className="question-list">{quickQuestions.map((item) => <button key={item} onClick={() => askQuestion(item)}>{item}<ChevronRight size={15} /></button>)}</div></> : <div className="agent-answer"><div className="answer-label"><Bot size={16} /> JCP AI</div><p>{answer}</p><div className="source-card"><div><FileText size={17} /><span><strong>SOP Perjalanan Dinas 2026</strong><small>Page 7 · Hotel allowance</small></span></div><button title="Open source"><ArrowUpRight size={15} /></button></div><div className="verified"><ShieldCheck size={15} /> Evidence verified</div></div>}
    </div>
    <form className="agent-composer" onSubmit={onAsk}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask anything about your workspace" aria-label="Ask the knowledge agent" /><button title="Send question"><Send size={17} /></button></form>
  </aside>
}

function DocumentsPage({ documents, uploadRef, onUpload }: { documents: DocumentItem[]; uploadRef: RefObject<HTMLInputElement | null>; onUpload: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => documents.filter((document) => document.name.toLowerCase().includes(query.toLowerCase())), [documents, query])
  return <div className="standard-page"><PageHeading eyebrow="Knowledge base" title="Documents" detail={`${documents.length} sources connected to this workspace.`} action={<><button className="primary-button" onClick={() => uploadRef.current?.click()}><Upload size={17} /> Upload document</button><input ref={uploadRef} className="visually-hidden" type="file" accept=".pdf,.docx" onChange={onUpload} /></>} /><div className="table-toolbar"><div className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents" /></div><button className="secondary-button"><FolderOpen size={16} /> All collections <ChevronDown size={14} /></button></div><div className="data-table"><table><thead><tr><th>Document</th><th>Collection</th><th>Updated</th><th>Status</th><th>Chunks</th><th aria-label="Actions" /></tr></thead><tbody>{filtered.map((document) => <tr key={document.id}><td><div className="document-name"><span><FileText size={18} /></span><strong>{document.name}</strong></div></td><td>{document.collection}</td><td>{document.updatedAt}</td><td><StatusBadge status={document.status} /></td><td>{document.chunks ?? '—'}</td><td><button className="icon-button" title={`Actions for ${document.name}`}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div></div>
}

function ChatPage({ question, setQuestion, answer, onAsk, askQuestion }: { question: string; setQuestion: (value: string) => void; answer: string; onAsk: (event: FormEvent) => void; askQuestion: (value: string) => void }) {
  return <div className="chat-page"><PageHeading eyebrow="AI assistant" title="Ask with confidence" detail="Every answer stays linked to its source." /><div className="chat-canvas">{answer ? <div className="conversation"><div className="user-message">{question || quickQuestions[0]}</div><div className="assistant-message"><div className="answer-label"><Sparkles size={16} /> JCP AI</div><p>{answer}</p><div className="source-card"><div><FileText size={17} /><span><strong>SOP Perjalanan Dinas 2026</strong><small>Page 7 · Hotel allowance</small></span></div><ArrowUpRight size={15} /></div></div></div> : <div className="chat-empty"><span><Sparkles size={27} /></span><h2>What would you like to know?</h2><p>Ask across policies, SOPs, handbooks, and internal documents.</p><div>{quickQuestions.slice(0, 2).map((item) => <button key={item} onClick={() => askQuestion(item)}>{item}</button>)}</div></div>}</div><form className="chat-composer" onSubmit={onAsk}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about your company knowledge" /><button title="Send question"><Send size={18} /></button></form></div>
}

function UsersPage() {
  const people = [{ initials: 'AR', name: 'Adam', email: 'adam@jcp.co.id', role: 'Workspace admin', access: 'Full access' }, { initials: 'NS', name: 'Nadia S.', email: 'nadia@jcp.co.id', role: 'Editor', access: 'Operations' }, { initials: 'RD', name: 'Raka D.', email: 'raka@jcp.co.id', role: 'Member', access: 'IT & Security' }]
  return <div className="standard-page"><PageHeading eyebrow="Access management" title="People & access" detail="Manage who can access collections and AI answers." action={<button className="primary-button"><Plus size={17} /> Invite person</button>} /><div className="data-table"><table><thead><tr><th>Person</th><th>Role</th><th>Collection access</th><th>Status</th><th /></tr></thead><tbody>{people.map((person) => <tr key={person.email}><td><div className="person-cell"><span className="avatar">{person.initials}</span><span><strong>{person.name}</strong><small>{person.email}</small></span></div></td><td>{person.role}</td><td>{person.access}</td><td><span className="active-user"><Check size={13} /> Active</span></td><td><button className="icon-button" title={`Actions for ${person.name}`}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div></div>
}

function PageHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: ReactNode; detail: string; action?: ReactNode }) { return <div className="page-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{detail}</p></div>{action && <div className="heading-actions">{action}</div>}</div> }
function SectionHeading({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <div className="section-heading"><div><h2>{title}</h2><p>{detail}</p></div>{action}</div> }
function Metric({ icon: Icon, value, label, note }: { icon: typeof FileText; value: number | string; label: string; note: string }) { return <div className="metric-card"><div className="metric-top"><span><Icon size={18} /></span><ArrowUpRight size={15} /></div><strong>{value}</strong><p>{label}</p><small>{note}</small></div> }
function Collection({ name, count, color }: { name: string; count: string; color: string }) { return <button className="collection-item"><span className={`collection-icon ${color}`}><BookOpen size={18} /></span><span><strong>{name}</strong><small>{count}</small></span><ChevronRight size={16} /></button> }
function DocumentActivity({ document }: { document: DocumentItem }) { return <div className="activity-row"><span className="file-icon"><FileText size={18} /></span><div><strong>{document.name}</strong><small>{document.collection} · {document.updatedAt}</small></div><StatusBadge status={document.status} /><button className="icon-button" title={`Open ${document.name}`}><ArrowUpRight size={16} /></button></div> }
function StatusBadge({ status }: { status: DocumentStatus }) { return <span className={`status-badge ${status.toLowerCase()}`}>{status === 'Ready' ? <Check size={12} /> : status === 'Processing' ? <LoaderCircle size={12} /> : <Clock3 size={12} />}{status}</span> }
