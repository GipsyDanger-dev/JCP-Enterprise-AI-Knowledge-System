import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode, RefObject } from 'react'
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Database,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Library,
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
type Role = 'admin' | 'employee'
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

const adminNavigation = [
  { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
  { id: 'documents' as const, label: 'Documents', icon: FolderOpen },
  { id: 'chat' as const, label: 'AI Assistant', icon: MessageSquareText },
  { id: 'users' as const, label: 'People & access', icon: Users },
]

const employeeNavigation = [
  { id: 'overview' as const, label: 'Home', icon: LayoutDashboard },
  { id: 'chat' as const, label: 'Ask AI', icon: MessageSquareText },
  { id: 'documents' as const, label: 'Knowledge library', icon: Library },
]

const quickQuestions = [
  'What is the hotel allowance for managers?',
  'Summarize our procurement approval flow',
  'Which security policy applies to contractors?',
]

export default function App() {
  const [role, setRole] = useState<Role>('admin')
  const [view, setView] = useState<View>('overview')
  const [documents, setDocuments] = useState(initialDocuments)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const navigation = role === 'admin' ? adminNavigation : employeeNavigation
  const person = role === 'admin'
    ? { name: 'Adam', initials: 'AR', label: 'Workspace admin' }
    : { name: 'Nadia', initials: 'NS', label: 'Employee' }

  const changeRole = (nextRole: Role) => {
    setRole(nextRole)
    if (nextRole === 'employee' && view === 'users') setView('overview')
  }

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
        <div className="workspace-switcher"><span>JC</span><div><strong>Jogja Creative</strong><small>{role === 'admin' ? 'Admin workspace' : 'Employee portal'}</small></div><ChevronDown size={15} /></div>
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
          <div className="profile-row"><span className="avatar">{person.initials}</span><div><strong>{person.name}</strong><small>{person.label}</small></div><MoreHorizontal size={17} /></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="menu-button" title="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="search-shell"><Search size={17} /><input aria-label="Search workspace" placeholder="Search documents, answers, or people" /></div>
          <div className="role-switch" aria-label="Preview dashboard role"><button className={role === 'admin' ? 'selected' : ''} onClick={() => changeRole('admin')}><ShieldCheck size={14} /> Admin</button><button className={role === 'employee' ? 'selected' : ''} onClick={() => changeRole('employee')}><Users size={14} /> Employee</button></div>
          <div className="top-actions"><button className="icon-button" title="Notifications"><Bell size={18} /><span className="notification-dot" /></button><button className="top-profile"><span className="avatar small">{person.initials}</span><ChevronDown size={14} /></button></div>
        </header>

        <div className="page-content">
          {view === 'overview' && role === 'admin' && <Overview documents={documents} openView={openView} uploadRef={uploadRef} onUpload={handleUpload} question={question} setQuestion={setQuestion} answer={answer} onAsk={handleAsk} askQuestion={askQuestion} />}
          {view === 'overview' && role === 'employee' && <EmployeeOverview openView={openView} question={question} setQuestion={setQuestion} answer={answer} onAsk={handleAsk} askQuestion={askQuestion} />}
          {view === 'documents' && <DocumentsPage documents={documents} uploadRef={uploadRef} onUpload={handleUpload} canManage={role === 'admin'} />}
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

function EmployeeOverview({ openView, question, setQuestion, answer, onAsk, askQuestion }: {
  openView: (view: View) => void
  question: string
  setQuestion: (value: string) => void
  answer: string
  onAsk: (event: FormEvent) => void
  askQuestion: (value: string) => void
}) {
  return <div className="employee-page">
    <PageHeading eyebrow="Tuesday, 18 August" title={<>Good morning, <span>Nadia.</span></>} detail="Find trusted answers and continue learning from company knowledge." action={<button className="secondary-button" onClick={() => openView('documents')}><Library size={17} /> Browse library</button>} />

    <section className="employee-ask">
      <div className="employee-ask-copy"><span><Sparkles size={19} /></span><div><small>JCP KNOWLEDGE AGENT</small><h2>What can we help you find today?</h2></div></div>
      <form onSubmit={onAsk}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about policies, benefits, SOPs, or procedures" aria-label="Ask company knowledge" /><button title="Send question"><Send size={18} /></button></form>
      <div className="employee-prompts">{quickQuestions.slice(0, 2).map((item) => <button key={item} onClick={() => askQuestion(item)}>{item}<ArrowUpRight size={14} /></button>)}</div>
    </section>

    {answer && <section className="employee-answer"><div className="answer-label"><Sparkles size={16} /> Answer from JCP AI</div><p>{answer}</p><div className="source-card"><div><FileText size={17} /><span><strong>SOP Perjalanan Dinas 2026</strong><small>Page 7 · Hotel allowance</small></span></div><button title="Open source"><ArrowUpRight size={15} /></button></div></section>}

    <div className="employee-dashboard-grid">
      <div className="employee-primary-column">
        <section>
          <SectionHeading title="Continue where you left off" detail="Recent answers and documents" action={<button className="link-button" onClick={() => openView('chat')}>View history <ArrowUpRight size={15} /></button>} />
          <div className="recent-grid">
            <button className="recent-item"><span className="recent-icon orange"><MessageSquareText size={18} /></span><div><small>AI ANSWER</small><strong>How does annual leave carry over?</strong><p>Answered from Employee Handbook · 2 sources</p></div><ArrowUpRight size={16} /></button>
            <button className="recent-item"><span className="recent-icon mint"><FileText size={18} /></span><div><small>DOCUMENT</small><strong>IT Security Quick Guide</strong><p>Viewed yesterday · Page 4</p></div><ArrowUpRight size={16} /></button>
          </div>
        </section>

        <section className="required-section">
          <SectionHeading title="Required reading" detail="Policies assigned to you" />
          <div className="required-list">
            <RequiredRead title="Information Security Policy" category="IT & Security" due="Due 22 Aug" progress={72} />
            <RequiredRead title="2026 Employee Handbook" category="People" due="Completed" progress={100} />
          </div>
        </section>
      </div>

      <aside className="employee-sidebar">
        <section className="employee-summary"><div className="summary-head"><span className="avatar employee-avatar">NS</span><div><strong>Nadia S.</strong><small>Creative Operations</small></div></div><div className="summary-stats"><div><strong>8</strong><span>Saved answers</span></div><div><strong>3</strong><span>Collections</span></div></div></section>
        <section className="quick-library"><SectionHeading title="Quick access" detail="Your available collections" /><button><span className="collection-icon orange"><BookOpen size={17} /></span><div><strong>Operations</strong><small>18 documents</small></div><ChevronRight size={16} /></button><button><span className="collection-icon mint"><ShieldCheck size={17} /></span><div><strong>IT & Security</strong><small>12 documents</small></div><ChevronRight size={16} /></button><button><span className="collection-icon violet"><Users size={17} /></span><div><strong>People</strong><small>9 documents</small></div><ChevronRight size={16} /></button></section>
      </aside>
    </div>
  </div>
}

function RequiredRead({ title, category, due, progress }: { title: string; category: string; due: string; progress: number }) {
  return <div className="required-item"><span className={progress === 100 ? 'required-icon complete' : 'required-icon'}>{progress === 100 ? <CheckCircle2 size={18} /> : <Compass size={18} />}</span><div><strong>{title}</strong><small>{category}</small></div><div className="reading-progress"><div><i style={{ width: `${progress}%` }} /></div><span>{due}</span></div><button className="icon-button" title={`Open ${title}`}><ArrowUpRight size={16} /></button></div>
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

function DocumentsPage({ documents, uploadRef, onUpload, canManage }: { documents: DocumentItem[]; uploadRef: RefObject<HTMLInputElement | null>; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; canManage: boolean }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => documents.filter((document) => document.name.toLowerCase().includes(query.toLowerCase())), [documents, query])
  const action = canManage ? <><button className="primary-button" onClick={() => uploadRef.current?.click()}><Upload size={17} /> Upload document</button><input ref={uploadRef} className="visually-hidden" type="file" accept=".pdf,.docx" onChange={onUpload} /></> : undefined
  return <div className="standard-page"><PageHeading eyebrow="Knowledge base" title={canManage ? 'Documents' : 'Knowledge library'} detail={canManage ? `${documents.length} sources connected to this workspace.` : `${documents.length} trusted sources available to you.`} action={action} /><div className="table-toolbar"><div className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents" /></div><button className="secondary-button"><FolderOpen size={16} /> All collections <ChevronDown size={14} /></button></div><div className="data-table"><table><thead><tr><th>Document</th><th>Collection</th><th>Updated</th><th>Status</th><th>Chunks</th><th aria-label="Actions" /></tr></thead><tbody>{filtered.map((document) => <tr key={document.id}><td><div className="document-name"><span><FileText size={18} /></span><strong>{document.name}</strong></div></td><td>{document.collection}</td><td>{document.updatedAt}</td><td><StatusBadge status={document.status} /></td><td>{document.chunks ?? '—'}</td><td><button className="icon-button" title={canManage ? `Actions for ${document.name}` : `Open ${document.name}`}>{canManage ? <MoreHorizontal size={17} /> : <ArrowUpRight size={16} />}</button></td></tr>)}</tbody></table></div></div>
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
