import { useState } from 'react'
import { ArrowUpRight, BookOpen, ChevronRight, Database, FileText, Library, MessageSquareText, Send, ShieldAlert, ShieldCheck, Sparkles, Upload, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AgentPanel } from '@/components/AgentPanel'
import { UploadModal } from '@/components/UploadModal'
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
  const { role, language } = useWorkspace()
  const isId = language === 'id'
  return role === 'admin' ? <AdminOverview isId={isId} /> : <EmployeeOverview isId={isId} />
}

function AdminOverview({ isId }: { isId: boolean }) {
  const navigate = useNavigate()
  const { documents, uploadError } = useWorkspace()
  const [showUpload, setShowUpload] = useState(false)
  const readyCount = documents.filter((document) => document.status === 'Ready').length
  const totalChunks = documents.reduce((sum, document) => sum + (document.chunks ?? 0), 0)
  const docsLabel = isId ? 'dokumen' : 'documents'
  return (
    <div className="overview-layout">
      <section className="overview-main">
        <PageHeading eyebrow={isId ? 'Selasa, 18 Agustus' : 'Tuesday, 18 August'} title={<>{isId ? 'Selamat pagi,' : 'Good morning,'} <span>Adam.</span></>} detail={isId ? 'Pengetahuan perusahaan Anda sudah terbaru dan siap digunakan.' : 'Your company knowledge is up to date and ready to use.'} action={<><button className="secondary-button" onClick={() => navigate('/chat')}><MessageSquareText size={17} /> {isId ? 'Tanya AI' : 'Ask AI'}</button><button className="primary-button" onClick={() => setShowUpload(true)}><Upload size={17} /> {isId ? 'Unggah' : 'Upload'}</button></>} />
        {uploadError && <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {uploadError}</div>}
        <div className="metrics-grid">
          <Metric icon={FileText} value={readyCount} label={isId ? 'Dokumen siap' : 'Ready documents'} note={isId ? '+2 minggu ini' : '+2 this week'} />
          <Metric icon={Database} value={totalChunks} label={isId ? 'Chunk terindeks' : 'Indexed chunks'} note={isId ? 'Di 4 koleksi' : 'Across 4 collections'} />
          <Metric icon={MessageSquareText} value="24" label={isId ? 'Pertanyaan terjawab' : 'Questions answered'} note={isId ? '92% dengan bukti' : '92% with evidence'} />
        </div>

        <section className="activity-section">
          <SectionHeading title={isId ? 'Aktivitas pengetahuan' : 'Knowledge activity'} detail={isId ? 'Perubahan terbaru di ruang kerja Anda' : 'Latest changes across your workspace'} action={<button className="link-button" onClick={() => navigate('/documents')}>{isId ? 'Lihat semua' : 'View all'} <ArrowUpRight size={15} /></button>} />
          <div className="activity-list">
            {documents.slice(0, 4).map((document) => <DocumentActivity key={document.id} document={document} />)}
          </div>
        </section>

        <section className="collection-section">
          <SectionHeading title={isId ? 'Koleksi' : 'Collections'} detail={isId ? 'Sumber terorganisir yang tersedia untuk tim Anda' : 'Organized sources available to your team'} />
          <div className="collection-grid">
            <Collection name="Operations" count={`18 ${docsLabel}`} color="orange" onClick={() => navigate('/documents?collection=Operations')} />
            <Collection name="IT & Security" count={`12 ${docsLabel}`} color="mint" onClick={() => navigate('/documents?collection=IT%20%26%20Security')} />
            <Collection name="People" count={`9 ${docsLabel}`} color="violet" onClick={() => navigate('/documents?collection=People')} />
          </div>
        </section>
      </section>

      <AgentPanel />
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={() => {}} />
    </div>
  )
}

function EmployeeOverview({ isId }: { isId: boolean }) {
  const navigate = useNavigate()
  const { question, setQuestion, answer, onAsk, askQuestion, language } = useWorkspace()
  const docsLabel = isId ? 'dokumen' : 'documents'
  return (
    <div className="employee-page">
      <PageHeading eyebrow={isId ? 'Selasa, 18 Agustus' : 'Tuesday, 18 August'} title={<>{isId ? 'Selamat pagi,' : 'Good morning,'} <span>Nadia.</span></>} detail={isId ? 'Temukan jawaban terpercaya dan terus belajar dari pengetahuan perusahaan.' : 'Find trusted answers and continue learning from company knowledge.'} action={<button className="secondary-button" onClick={() => navigate('/documents')}><Library size={17} /> {isId ? 'Jelajahi perpustakaan' : 'Browse library'}</button>} />

      <section className="employee-ask">
        <div className="employee-ask-copy"><span><Sparkles size={19} /></span><div><small>ENTERPRISE AI</small><h2>{isId ? 'Apa yang bisa kami bantu cari hari ini?' : 'What can we help you find today?'}</h2></div></div>
        <form onSubmit={onAsk}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={isId ? 'Tanyakan tentang kebijakan, manfaat, SOP, atau prosedur' : 'Ask about policies, benefits, SOPs, or procedures'} aria-label={isId ? 'Tanyakan pengetahuan perusahaan' : 'Ask company knowledge'} /><button title={isId ? 'Kirim pertanyaan' : 'Send question'}><Send size={18} /></button></form>
        <div className="employee-prompts">{quickQuestions(language).slice(0, 2).map((item) => <button key={item} onClick={() => askQuestion(item)}>{item}<ArrowUpRight size={14} /></button>)}</div>
      </section>

      {answer && <section className="employee-answer"><div className="answer-label"><Sparkles size={16} /> {isId ? 'Jawaban dari Enterprise AI' : 'Answer from Enterprise AI'}</div><p>{answer}</p><SourceCard title="SOP Perjalanan Dinas 2026" detail={isId ? 'Halaman 7 · Tunjangan hotel' : 'Page 7 · Hotel allowance'} /></section>}

      <div className="employee-dashboard-grid">
        <div className="employee-primary-column">
          <section>
            <SectionHeading title={isId ? 'Lanjutkan dari yang terakhir' : 'Continue where you left off'} detail={isId ? 'Jawaban dan dokumen terbaru' : 'Recent answers and documents'} action={<button className="link-button" onClick={() => navigate('/chat')}>{isId ? 'Lihat riwayat' : 'View history'} <ArrowUpRight size={15} /></button>} />
            <div className="recent-grid">
              <button className="recent-item" onClick={() => navigate('/chat')}><span className="recent-icon orange"><MessageSquareText size={18} /></span><div><small>JAWABAN AI</small><strong>{isId ? 'Bagaimana cuti tahunan ditangguhkan?' : 'How does annual leave carry over?'}</strong><p>{isId ? 'Dijawab dari Employee Handbook · 2 sumber' : 'Answered from Employee Handbook · 2 sources'}</p></div><ArrowUpRight size={16} /></button>
              <button className="recent-item" onClick={() => navigate('/documents')}><span className="recent-icon mint"><FileText size={18} /></span><div><small>DOKUMEN</small><strong>{isId ? 'Panduan Keamanan IT' : 'IT Security Quick Guide'}</strong><p>{isId ? 'Dilihat kemarin · Halaman 4' : 'Viewed yesterday · Page 4'}</p></div><ArrowUpRight size={16} /></button>
            </div>
          </section>

          <section className="required-section">
            <SectionHeading title={isId ? 'Wajib baca' : 'Required reading'} detail={isId ? 'Kebijakan yang ditugaskan untuk Anda' : 'Policies assigned to you'} />
            <div className="required-list">
              <RequiredRead title="Information Security Policy" category="IT & Security" due={isId ? 'Jatuh tempo 22 Agt' : 'Due 22 Aug'} progress={72} onClick={() => navigate('/documents?collection=IT%20%26%20Security')} />
              <RequiredRead title="2026 Employee Handbook" category="People" due={isId ? 'Selesai' : 'Completed'} progress={100} onClick={() => navigate('/documents?collection=People')} />
            </div>
          </section>
        </div>

        <aside className="employee-sidebar">
          <section className="employee-summary"><div className="summary-head"><span className="avatar employee-avatar">NS</span><div><strong>Nadia S.</strong><small>Creative Operations</small></div></div><div className="summary-stats"><div><strong>8</strong><span>{isId ? 'Jawaban tersimpan' : 'Saved answers'}</span></div><div><strong>3</strong><span>{isId ? 'Koleksi' : 'Collections'}</span></div></div></section>
          <section className="quick-library"><SectionHeading title={isId ? 'Akses cepat' : 'Quick access'} detail={isId ? 'Koleksi yang tersedia untuk Anda' : 'Your available collections'} /><button onClick={() => navigate('/documents?collection=Operations')}><span className="collection-icon orange"><BookOpen size={17} /></span><div><strong>Operations</strong><small>18 {docsLabel}</small></div><ChevronRight size={16} /></button><button onClick={() => navigate('/documents?collection=IT%20%26%20Security')}><span className="collection-icon mint"><ShieldCheck size={17} /></span><div><strong>IT & Security</strong><small>12 {docsLabel}</small></div><ChevronRight size={16} /></button><button onClick={() => navigate('/documents?collection=People')}><span className="collection-icon violet"><Users size={17} /></span><div><strong>People</strong><small>9 {docsLabel}</small></div><ChevronRight size={16} /></button></section>
        </aside>
      </div>
    </div>
  )
}
