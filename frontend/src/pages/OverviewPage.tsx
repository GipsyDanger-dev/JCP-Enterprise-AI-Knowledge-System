import { ArrowUpRight, BookOpen, ChevronRight, Database, FileText, Library, LoaderCircle, MessageSquareText, Send, ShieldAlert, ShieldCheck, Sparkles, Upload, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AgentPanel } from '@/components/AgentPanel'
import { Collection } from '@/components/Collection'
import { DocumentActivity } from '@/components/DocumentActivity'
import { Metric } from '@/components/Metric'
import { PageHeading } from '@/components/PageHeading'
import { RequiredRead } from '@/components/RequiredRead'
import { SectionHeading } from '@/components/SectionHeading'
import { SourceCard } from '@/components/SourceCard'
import { useWorkspace } from '@/hooks/useWorkspace'
import { quickQuestions } from '@/types/domain'

export function OverviewPage() {
  const { role } = useWorkspace()
  return role === 'admin' ? <AdminOverview /> : <EmployeeOverview />
}

function AdminOverview() {
  const navigate = useNavigate()
  const { documents, triggerUpload, isUploading, uploadError } = useWorkspace()
  const readyCount = documents.filter((document) => document.status === 'Ready').length
  const totalChunks = documents.reduce((sum, document) => sum + (document.chunks ?? 0), 0)
  return (
    <div className="overview-layout">
      <section className="overview-main">
        <PageHeading eyebrow="Tuesday, 18 August" title={<>Good morning, <span>Adam.</span></>} detail="Your company knowledge is up to date and ready to use." action={<><button className="secondary-button" onClick={() => navigate('/chat')}><MessageSquareText size={17} /> Ask AI</button><button className="primary-button" onClick={triggerUpload} disabled={isUploading}>{isUploading ? <LoaderCircle size={17} className="spin" /> : <Upload size={17} />}{isUploading ? 'Mengunggah…' : 'Upload'}</button></>} />
        {uploadError && <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {uploadError}</div>}
        <div className="metrics-grid">
          <Metric icon={FileText} value={readyCount} label="Ready documents" note="+2 this week" />
          <Metric icon={Database} value={totalChunks} label="Indexed chunks" note="Across 4 collections" />
          <Metric icon={MessageSquareText} value="24" label="Questions answered" note="92% with evidence" />
        </div>

        <section className="activity-section">
          <SectionHeading title="Knowledge activity" detail="Latest changes across your workspace" action={<button className="link-button" onClick={() => navigate('/documents')}>View all <ArrowUpRight size={15} /></button>} />
          <div className="activity-list">
            {documents.slice(0, 4).map((document) => <DocumentActivity key={document.id} document={document} />)}
          </div>
        </section>

        <section className="collection-section">
          <SectionHeading title="Collections" detail="Organized sources available to your team" />
          <div className="collection-grid">
            <Collection name="Operations" count="18 documents" color="orange" onClick={() => navigate('/documents?collection=Operations')} />
            <Collection name="IT & Security" count="12 documents" color="mint" onClick={() => navigate('/documents?collection=IT%20%26%20Security')} />
            <Collection name="People" count="9 documents" color="violet" onClick={() => navigate('/documents?collection=People')} />
          </div>
        </section>
      </section>

      <AgentPanel />
    </div>
  )
}

function EmployeeOverview() {
  const navigate = useNavigate()
  const { question, setQuestion, answer, onAsk, askQuestion } = useWorkspace()
  return (
    <div className="employee-page">
      <PageHeading eyebrow="Tuesday, 18 August" title={<>Good morning, <span>Nadia.</span></>} detail="Find trusted answers and continue learning from company knowledge." action={<button className="secondary-button" onClick={() => navigate('/documents')}><Library size={17} /> Browse library</button>} />

      <section className="employee-ask">
        <div className="employee-ask-copy"><span><Sparkles size={19} /></span><div><small>ENTERPRISE AI</small><h2>What can we help you find today?</h2></div></div>
        <form onSubmit={onAsk}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about policies, benefits, SOPs, or procedures" aria-label="Ask company knowledge" /><button title="Send question"><Send size={18} /></button></form>
        <div className="employee-prompts">{quickQuestions.slice(0, 2).map((item) => <button key={item} onClick={() => askQuestion(item)}>{item}<ArrowUpRight size={14} /></button>)}</div>
      </section>

      {answer && <section className="employee-answer"><div className="answer-label"><Sparkles size={16} /> Answer from Enterprise AI</div><p>{answer}</p><SourceCard title="SOP Perjalanan Dinas 2026" detail="Page 7 · Hotel allowance" /></section>}

      <div className="employee-dashboard-grid">
        <div className="employee-primary-column">
          <section>
            <SectionHeading title="Continue where you left off" detail="Recent answers and documents" action={<button className="link-button" onClick={() => navigate('/chat')}>View history <ArrowUpRight size={15} /></button>} />
            <div className="recent-grid">
              <button className="recent-item" onClick={() => navigate('/chat')}><span className="recent-icon orange"><MessageSquareText size={18} /></span><div><small>AI ANSWER</small><strong>How does annual leave carry over?</strong><p>Answered from Employee Handbook · 2 sources</p></div><ArrowUpRight size={16} /></button>
              <button className="recent-item" onClick={() => navigate('/documents')}><span className="recent-icon mint"><FileText size={18} /></span><div><small>DOCUMENT</small><strong>IT Security Quick Guide</strong><p>Viewed yesterday · Page 4</p></div><ArrowUpRight size={16} /></button>
            </div>
          </section>

          <section className="required-section">
            <SectionHeading title="Required reading" detail="Policies assigned to you" />
            <div className="required-list">
              <RequiredRead title="Information Security Policy" category="IT & Security" due="Due 22 Aug" progress={72} onClick={() => navigate('/documents?collection=IT%20%26%20Security')} />
              <RequiredRead title="2026 Employee Handbook" category="People" due="Completed" progress={100} onClick={() => navigate('/documents?collection=People')} />
            </div>
          </section>
        </div>

        <aside className="employee-sidebar">
          <section className="employee-summary"><div className="summary-head"><span className="avatar employee-avatar">NS</span><div><strong>Nadia S.</strong><small>Creative Operations</small></div></div><div className="summary-stats"><div><strong>8</strong><span>Saved answers</span></div><div><strong>3</strong><span>Collections</span></div></div></section>
          <section className="quick-library"><SectionHeading title="Quick access" detail="Your available collections" /><button onClick={() => navigate('/documents?collection=Operations')}><span className="collection-icon orange"><BookOpen size={17} /></span><div><strong>Operations</strong><small>18 documents</small></div><ChevronRight size={16} /></button><button onClick={() => navigate('/documents?collection=IT%20%26%20Security')}><span className="collection-icon mint"><ShieldCheck size={17} /></span><div><strong>IT & Security</strong><small>12 documents</small></div><ChevronRight size={16} /></button><button onClick={() => navigate('/documents?collection=People')}><span className="collection-icon violet"><Users size={17} /></span><div><strong>People</strong><small>9 documents</small></div><ChevronRight size={16} /></button></section>
        </aside>
      </div>
    </div>
  )
}
