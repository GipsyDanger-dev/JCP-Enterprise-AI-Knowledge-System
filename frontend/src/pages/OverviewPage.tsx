import { useEffect, useState } from 'react'
import { ArrowUpRight, BookOpen, ChevronRight, Database, FileText, Library, MessageSquareText, Send, ShieldAlert, Sparkles, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
import { listConversations } from '@/api/chat'
import { useAuth } from '@/hooks/useAuth'
import { listMyRequiredReadings, requiredReadingReport, type RequiredReading, type RequiredReadingReport } from '@/api/requiredReadings'

const dueLabel = (dueAt: string, isId: boolean) => `${isId ? 'Tenggat' : 'Due'} ${new Date(dueAt).toLocaleDateString(isId ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' })}`

export function OverviewPage() {
  const { role, language } = useWorkspace()
  const isId = language === 'id'
  return role === 'admin' ? <AdminOverview isId={isId} /> : <EmployeeOverview isId={isId} />
}

function AdminOverview({ isId }: { isId: boolean }) {
  const navigate = useNavigate()
  const { token, user } = useAuth()
  const { documents, uploadError, registerUploadedDocument } = useWorkspace()
  const [showUpload, setShowUpload] = useState(false)
  const [conversationCount, setConversationCount] = useState(0)
  const [readingReport, setReadingReport] = useState<RequiredReadingReport[]>([])
  useEffect(() => { if (token) listConversations(token).then((items) => setConversationCount(items.length)).catch(() => setConversationCount(0)) }, [token])
  useEffect(() => { if (token) requiredReadingReport(token).then(setReadingReport).catch(() => setReadingReport([])) }, [token])
  const readyCount = documents.filter((document) => document.status === 'Ready').length
  const totalChunks = documents.reduce((sum, document) => sum + (document.chunks ?? 0), 0)
  const docsLabel = isId ? 'dokumen' : 'documents'
  return (
    <div className="overview-layout">
      <section className="overview-main">
        <PageHeading eyebrow={new Date().toLocaleDateString(isId ? 'id-ID' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })} title={<>{isId ? 'Selamat pagi,' : 'Good morning,'} <span>{user?.displayName ?? (isId ? 'Admin' : 'Admin')}.</span></>} detail={isId ? 'Pengetahuan perusahaan Anda sudah terbaru dan siap digunakan.' : 'Your company knowledge is up to date and ready to use.'} action={<><button className="secondary-button" onClick={() => navigate('/chat')}><MessageSquareText size={17} /> {isId ? 'Tanya AI' : 'Ask AI'}</button><button className="primary-button" onClick={() => setShowUpload(true)}><Upload size={17} /> {isId ? 'Unggah' : 'Upload'}</button></>} />
        {uploadError && <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {uploadError}</div>}
        <div className="metrics-grid">
          <Metric icon={FileText} value={readyCount} label={isId ? 'Dokumen siap' : 'Ready documents'} note={isId ? '+2 minggu ini' : '+2 this week'} />
          <Metric icon={Database} value={totalChunks} label={isId ? 'Chunk terindeks' : 'Indexed chunks'} note={isId ? 'Di 4 koleksi' : 'Across 4 collections'} />
          <Metric icon={MessageSquareText} value={conversationCount} label={isId ? 'Percakapan AI' : 'AI conversations'} note={isId ? 'Dari riwayat Anda' : 'From your history'} />
        </div>

        <section className="activity-section">
          <SectionHeading title={isId ? 'Aktivitas pengetahuan' : 'Knowledge activity'} detail={isId ? 'Perubahan terbaru di ruang kerja Anda' : 'Latest changes across your workspace'} action={<button className="link-button" onClick={() => navigate('/documents')}>{isId ? 'Lihat semua' : 'View all'} <ArrowUpRight size={15} /></button>} />
          <div className="activity-list">
            {documents.slice(0, 4).map((document) => <DocumentActivity key={document.id} document={document} onOpen={() => navigate(`/documents?doc=${encodeURIComponent(document.id)}`)} />)}
          </div>
        </section>

        <section className="collection-section">
          <SectionHeading title={isId ? 'Koleksi' : 'Collections'} detail={isId ? 'Sumber terorganisir yang tersedia untuk tim Anda' : 'Organized sources available to your team'} />
          <div className="collection-grid">
            {['Operations', 'IT & Security', 'Finance', 'People'].map((collection, index) => {
              const count = documents.filter((document) => document.collection === collection).length
              return <Collection key={collection} name={collection} count={`${count} ${docsLabel}`} color={(['orange', 'mint', 'violet', 'orange'] as const)[index]} onClick={() => navigate(`/documents?collection=${encodeURIComponent(collection)}`)} />
            })}
          </div>
        </section>
        {readingReport.length > 0 && <section className="required-section"><SectionHeading title={isId ? 'Laporan wajib baca' : 'Required reading report'} detail={isId ? 'Progres karyawan per dokumen' : 'Employee progress by document'} /><div className="required-list">{readingReport.map((item) => <div key={item.documentId} className="required-report"><RequiredRead title={item.title} category={`${item.completed}/${item.total} ${isId ? 'selesai' : 'completed'}`} due={item.overdue ? `${item.overdue} ${isId ? 'terlambat' : 'overdue'}` : `${item.progress}%`} progress={item.progress} overdue={item.overdue > 0} /><div className="reading-report-people">{item.readers.map((reader) => <div key={reader.employeeNumber} className="reading-report-person"><span><strong>{reader.displayName}</strong><small>{reader.employeeNumber} · {reader.division} · {reader.jobTitle} · {dueLabel(reader.dueAt, isId)}</small></span><b>{reader.progress === 100 ? (isId ? 'Sudah membaca' : 'Read') : reader.isOverdue ? (isId ? `Terlambat · ${reader.progress}%` : `Overdue · ${reader.progress}%`) : `${reader.progress}%`}</b></div>)}</div></div>)}</div></section>}
      </section>

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={registerUploadedDocument} />
    </div>
  )
}

function EmployeeOverview({ isId }: { isId: boolean }) {
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { question, setQuestion, onAsk, askQuestion, language, chatHistory, documents } = useWorkspace()
  const [conversationCount, setConversationCount] = useState(0)
  const [requiredReadings, setRequiredReadings] = useState<RequiredReading[]>([])
  useEffect(() => { if (token) listConversations(token).then((items) => setConversationCount(items.length)).catch(() => setConversationCount(0)) }, [token])
  useEffect(() => { if (token) listMyRequiredReadings(token).then(setRequiredReadings).catch(() => setRequiredReadings([])) }, [token])
  const answer = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].answer : ''
  const latestCitation = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].citations[0] : null
  const docsLabel = isId ? 'dokumen' : 'documents'
  return (
    <div className="employee-page">
      <PageHeading eyebrow={new Date().toLocaleDateString(isId ? 'id-ID' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })} title={<>{isId ? 'Selamat pagi,' : 'Good morning,'} <span>{user?.displayName ?? (isId ? 'Pengguna' : 'User')}.</span></>} detail={isId ? 'Temukan jawaban terpercaya dan terus belajar dari pengetahuan perusahaan.' : 'Find trusted answers and continue learning from company knowledge.'} action={<button className="secondary-button" onClick={() => navigate('/documents')}><Library size={17} /> {isId ? 'Jelajahi perpustakaan' : 'Browse library'}</button>} />

      <section className="employee-ask">
        <div className="employee-ask-copy"><span><Sparkles size={19} /></span><div><small>ENTERPRISE AI</small><h2>{isId ? 'Apa yang bisa kami bantu cari hari ini?' : 'What can we help you find today?'}</h2></div></div>
        <form onSubmit={onAsk}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={isId ? 'Tanyakan tentang kebijakan, manfaat, SOP, atau prosedur' : 'Ask about policies, benefits, SOPs, or procedures'} aria-label={isId ? 'Tanyakan pengetahuan perusahaan' : 'Ask company knowledge'} /><button title={isId ? 'Kirim pertanyaan' : 'Send question'}><Send size={18} /></button></form>
        <div className="employee-prompts">{quickQuestions(language, documents).slice(0, 2).map((item) => <button key={item} onClick={() => askQuestion(item)}>{item}<ArrowUpRight size={14} /></button>)}</div>
      </section>

      {answer && <section className="employee-answer"><div className="answer-label"><Sparkles size={16} /> {isId ? 'Jawaban dari Enterprise AI' : 'Answer from Enterprise AI'}</div><p>{answer}</p>{latestCitation && <SourceCard title={latestCitation.filename} detail={[latestCitation.sectionTitle, latestCitation.pageNumber ? `${isId ? 'Halaman' : 'Page'} ${latestCitation.pageNumber}` : null].filter(Boolean).join(' · ')} />}</section>}

      <div className="employee-dashboard-grid">
        <div className="employee-primary-column">
          <section>
            <SectionHeading title={isId ? 'Lanjutkan dari yang terakhir' : 'Continue where you left off'} detail={isId ? 'Jawaban dan dokumen terbaru' : 'Recent answers and documents'} action={<button className="link-button" onClick={() => navigate('/chat')}>{isId ? 'Lihat riwayat' : 'View history'} <ArrowUpRight size={15} /></button>} />
            <div className="recent-grid">
              <button className="recent-item" onClick={() => navigate('/history')}><span className="recent-icon orange"><MessageSquareText size={18} /></span><div><small>{isId ? 'RIWAYAT AI' : 'AI HISTORY'}</small><strong>{conversationCount} {isId ? 'percakapan tersimpan' : 'saved conversations'}</strong><p>{isId ? 'Buka riwayat pertanyaan Anda' : 'Open your question history'}</p></div><ArrowUpRight size={16} /></button>
              <button className="recent-item" onClick={() => navigate('/documents')}><span className="recent-icon mint"><FileText size={18} /></span><div><small>{isId ? 'DOKUMEN' : 'DOCUMENTS'}</small><strong>{documents.length} {isId ? 'dokumen tersedia' : 'documents available'}</strong><p>{isId ? 'Jelajahi perpustakaan pengetahuan' : 'Browse the knowledge library'}</p></div><ArrowUpRight size={16} /></button>
            </div>
          </section>

          <section className="required-section">
            <SectionHeading title={isId ? 'Wajib baca' : 'Required reading'} detail={isId ? 'Kebijakan yang ditugaskan untuk Anda' : 'Policies assigned to you'} />
            <div className="required-list">
              {requiredReadings.length === 0 ? <p className="empty-row">{isId ? 'Tidak ada dokumen wajib baca.' : 'No required reading assigned.'}</p> : requiredReadings.map((reading) => <RequiredRead key={reading.id} title={reading.document.title} category={reading.document.collection ?? 'Operations'} due={reading.progress === 100 ? (isId ? 'Selesai' : 'Complete') : reading.isOverdue ? (isId ? 'Terlambat' : 'Overdue') : dueLabel(reading.dueAt, isId)} progress={reading.progress} overdue={reading.isOverdue} onClick={() => navigate(`/documents?doc=${encodeURIComponent(reading.documentId)}&reading=${encodeURIComponent(reading.id)}`)} />)}
            </div>
          </section>
        </div>

        <aside className="employee-sidebar">
          <section className="employee-summary"><div className="summary-head"><span className="avatar employee-avatar">{user?.displayName?.slice(0, 2).toUpperCase() ?? 'US'}</span><div><strong>{user?.displayName ?? (isId ? 'Pengguna' : 'User')}</strong><small>{user?.username ? `@${user.username}` : ''}</small></div></div><div className="summary-stats"><div><strong>{conversationCount}</strong><span>{isId ? 'Percakapan' : 'Conversations'}</span></div><div><strong>{new Set(documents.map((document) => document.collection)).size}</strong><span>{isId ? 'Koleksi' : 'Collections'}</span></div></div></section>
          <section className="quick-library"><SectionHeading title={isId ? 'Akses cepat' : 'Quick access'} detail={isId ? 'Koleksi yang tersedia untuk Anda' : 'Your available collections'} />{Array.from(new Set(documents.map((document) => document.collection))).slice(0, 3).map((collection, index) => { const count = documents.filter((document) => document.collection === collection).length; return <button key={collection} onClick={() => navigate(`/documents?collection=${encodeURIComponent(collection)}`)}><span className={`collection-icon ${(['orange', 'mint', 'violet'] as const)[index]}`}><BookOpen size={17} /></span><div><strong>{collection}</strong><small>{count} {docsLabel}</small></div><ChevronRight size={16} /></button> })}</section>
        </aside>
      </div>
    </div>
  )
}
