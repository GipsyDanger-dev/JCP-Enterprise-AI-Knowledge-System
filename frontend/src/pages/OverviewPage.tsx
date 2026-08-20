import { useState } from 'react'
import { ArrowUpRight, FileText, Library, Loader2, MessageSquareText, RefreshCw, Send, ShieldAlert, Sparkles, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AgentPanel } from '@/components/AgentPanel'
import { UploadModal } from '@/components/UploadModal'
import { DocumentActivity } from '@/components/DocumentActivity'
import { Metric } from '@/components/Metric'
import { PageHeading } from '@/components/PageHeading'
import { SectionHeading } from '@/components/SectionHeading'
import { SourceCard } from '@/components/SourceCard'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { quickQuestions } from '@/types/domain'
import { userPresentation } from '@/utils/user'

function todayLabel(): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function OverviewPage() {
  const { role } = useWorkspace()
  if (role === 'admin') return <AdminOverview />
  if (role === 'employee') return <EmployeeOverview />
  return null
}

function AdminOverview() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    documents,
    documentsLoading,
    documentsError,
    reloadDocuments,
    uploadError,
    registerUploadedDocument,
  } = useWorkspace()
  const [showUpload, setShowUpload] = useState(false)
  const readyCount = documents.filter((document) => document.status === 'Ready').length
  const processingCount = documents.filter((document) => document.status === 'Queued' || document.status === 'Processing').length

  return (
    <div className="overview-layout">
      <section className="overview-main">
        <PageHeading
          eyebrow={todayLabel()}
          title={<>{greeting()}{user ? <>, <span>{user.displayName}.</span></> : '.'}</>}
          detail="Review the current state of your company knowledge."
          action={<><button className="secondary-button" onClick={() => navigate('/chat')}><MessageSquareText size={17} /> Ask AI</button><button className="primary-button" onClick={() => setShowUpload(true)}><Upload size={17} /> Upload</button></>}
        />
        {uploadError && <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {uploadError}</div>}
        <div className="metrics-grid">
          <Metric icon={FileText} value={documents.length} label="Documents" note="Returned by the knowledge API" />
          <Metric icon={FileText} value={readyCount} label="Ready documents" note="Available for grounded answers" />
          <Metric icon={Loader2} value={processingCount} label="In processing" note="Queued or currently processing" />
        </div>

        <section className="activity-section">
          <SectionHeading title="Knowledge documents" detail="Latest document metadata from the backend" action={<button className="link-button" onClick={() => navigate('/documents')}>View all <ArrowUpRight size={15} /></button>} />
          {documentsLoading ? (
            <div className="users-loading"><Loader2 size={20} className="spin" /> Loading documents...</div>
          ) : documentsError ? (
            <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {documentsError}<button className="link-button" onClick={() => void reloadDocuments()}><RefreshCw size={14} /> Retry</button></div>
          ) : documents.length === 0 ? (
            <div className="empty-row">No documents have been uploaded.</div>
          ) : (
            <div className="activity-list">
              {documents.slice(0, 5).map((document) => <DocumentActivity key={document.id} document={document} />)}
            </div>
          )}
        </section>
      </section>

      <AgentPanel />
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={registerUploadedDocument} />
    </div>
  )
}

function EmployeeOverview() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    documents,
    documentsLoading,
    documentsError,
    reloadDocuments,
    question,
    setQuestion,
    answer,
    citations,
    isLoadingAnswer,
    chatError,
    onAsk,
    askQuestion,
  } = useWorkspace()
  const person = user ? userPresentation(user) : null

  return (
    <div className="employee-page">
      <PageHeading
        eyebrow={todayLabel()}
        title={<>{greeting()}{user ? <>, <span>{user.displayName}.</span></> : '.'}</>}
        detail="Find answers grounded in the knowledge available to your account."
        action={<button className="secondary-button" onClick={() => navigate('/documents')}><Library size={17} /> Browse library</button>}
      />

      <section className="employee-ask">
        <div className="employee-ask-copy"><span><Sparkles size={19} /></span><div><small>ENTERPRISE AI</small><h2>What can we help you find today?</h2></div></div>
        <form onSubmit={onAsk}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about company policies, SOPs, or procedures" aria-label="Ask company knowledge" disabled={isLoadingAnswer} /><button title="Send question" disabled={isLoadingAnswer || !question.trim()}>{isLoadingAnswer ? <Loader2 size={18} className="spin" /> : <Send size={18} />}</button></form>
        <div className="employee-prompts">{quickQuestions.slice(0, 2).map((item) => <button key={item} onClick={() => askQuestion(item)} disabled={isLoadingAnswer}>{item}<ArrowUpRight size={14} /></button>)}</div>
      </section>

      {chatError && !answer && <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {chatError}</div>}
      {answer && (
        <section className="employee-answer">
          <div className="answer-label"><Sparkles size={16} /> Answer from Enterprise AI</div>
          <p>{answer}</p>
          {citations.map((citation) => (
            <SourceCard
              key={`${citation.documentId}-${citation.chunkId}`}
              title={citation.filename}
              detail={[citation.sectionTitle, citation.pageNumber ? `Page ${citation.pageNumber}` : null].filter(Boolean).join(' - ')}
              excerpt={citation.excerpt}
            />
          ))}
        </section>
      )}

      <div className="employee-dashboard-grid">
        <div className="employee-primary-column">
          <section>
            <SectionHeading title="Available knowledge" detail="Documents your account can access" action={<button className="link-button" onClick={() => navigate('/documents')}>View library <ArrowUpRight size={15} /></button>} />
            {documentsLoading ? (
              <div className="users-loading"><Loader2 size={20} className="spin" /> Loading documents...</div>
            ) : documentsError ? (
              <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {documentsError}<button className="link-button" onClick={() => void reloadDocuments()}><RefreshCw size={14} /> Retry</button></div>
            ) : documents.length === 0 ? (
              <div className="empty-row">No ready documents are available.</div>
            ) : (
              <div className="activity-list">{documents.slice(0, 5).map((document) => <DocumentActivity key={document.id} document={document} />)}</div>
            )}
          </section>
        </div>

        {person && (
          <aside className="employee-sidebar">
            <section className="employee-summary">
              <div className="summary-head"><span className="avatar employee-avatar">{person.initials}</span><div><strong>{person.name}</strong><small>{person.label}</small></div></div>
              <div className="summary-stats"><div><strong>{documents.length}</strong><span>Available documents</span></div><div><strong>{citations.length}</strong><span>Current answer sources</span></div></div>
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}
