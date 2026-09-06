import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Archive, CheckCheck, Loader2, Megaphone, Plus, RotateCcw, Send, Users } from 'lucide-react'
import {
  createAnnouncement,
  getAnnouncementPermissions,
  getAnnouncementReaders,
  listAnnouncements,
  updateAnnouncement,
  type Announcement,
  type AnnouncementReadReport,
  type AnnouncementReader,
} from '@/api/announcements'
import { errorMessage } from '@/api/client'
import { PageHeading } from '@/components/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

const formatPublishedAt = (value: string, isId: boolean) => new Date(value).toLocaleDateString(isId ? 'id-ID' : 'en-US', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

const formatReadAt = (value: string, isId: boolean) => new Date(value).toLocaleDateString(isId ? 'id-ID' : 'en-US', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

/** Satu baris pegawai di laporan baca. */
function ReaderRow({ person, isId }: { person: AnnouncementReader; isId: boolean }) {
  return (
    <div className="announcement-reader">
      <span>
        <strong>{person.displayName}</strong>
        <small>{person.employeeNumber} · {person.jobTitle}{person.unitKerja ? ` · ${person.unitKerja}` : ''}</small>
      </span>
      <b>{person.readAt ? formatReadAt(person.readAt, isId) : (isId ? 'Belum membaca' : 'Not yet read')}</b>
    </div>
  )
}

export function AnnouncementsPage() {
  const { token, user } = useAuth()
  const { language, markAnnouncementsSeen } = useWorkspace()
  const isId = language === 'id'
  // Ditanyakan ke server: yang boleh menerbitkan bukan hanya admin, melainkan
  // juga jabatan pimpinan — dan daftarnya hanya dipegang backend.
  const [canManage, setCanManage] = useState(user?.isAdmin ?? false)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [showComposer, setShowComposer] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Laporan baca dimuat saat dibuka, bukan bersama daftarnya: satu laporan
  // menarik seluruh pegawai aktif, dan biasanya hanya satu yang ditengok.
  const [openReport, setOpenReport] = useState<string | null>(null)
  const [report, setReport] = useState<AnnouncementReadReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  // Pengumuman yang laporannya sedang diminta. Membuka pengumuman lain sebelum
  // permintaan sebelumnya selesai tidak boleh membuat jawaban yang telat datang
  // menimpa panel yang sedang dilihat.
  const requestedReportRef = useRef<string | null>(null)

  const loadAnnouncements = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      setAnnouncements(await listAnnouncements(token))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadAnnouncements() }, [loadAnnouncements])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getAnnouncementPermissions(token)
      .then(({ canPublish }) => { if (!cancelled) setCanManage(canPublish) })
      .catch(() => { if (!cancelled) setCanManage(user?.isAdmin ?? false) })
    return () => { cancelled = true }
  }, [token, user?.isAdmin])

  // Membuka halaman ini berarti pengumuman sudah dibaca — badge dibersihkan
  // dan bukti bacanya tercatat per pengumuman di server.
  useEffect(() => { markAnnouncementsSeen() }, [markAnnouncementsSeen])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!token || !title.trim() || !body.trim()) return
    setSaving(true)
    setError(null)
    try {
      const announcement = await createAnnouncement({ title: title.trim(), body: body.trim() }, token)
      setAnnouncements((items) => [announcement, ...items])
      setTitle('')
      setBody('')
      setShowComposer(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (announcement: Announcement) => {
    if (!token) return
    setError(null)
    try {
      const updated = await updateAnnouncement(announcement.id, { isActive: !announcement.isActive }, token)
      setAnnouncements((items) => items.map((item) => item.id === updated.id ? updated : item))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const toggleReport = async (announcement: Announcement) => {
    if (openReport === announcement.id) { setOpenReport(null); requestedReportRef.current = null; return }
    setOpenReport(announcement.id)
    setReport(null)
    if (!token) return
    requestedReportRef.current = announcement.id
    setReportLoading(true)
    setError(null)
    try {
      const loaded = await getAnnouncementReaders(announcement.id, token)
      // Angka di tombol berasal dari daftar yang dimuat saat halaman dibuka;
      // laporan ini lebih baru, jadi sekalian dipakai menyegarkannya.
      setAnnouncements((items) => items.map((item) => item.id === loaded.announcementId ? { ...item, readCount: loaded.readCount } : item))
      if (requestedReportRef.current !== announcement.id) return
      setReport(loaded)
    } catch (err) {
      if (requestedReportRef.current !== announcement.id) return
      setError(errorMessage(err))
      setOpenReport(null)
    } finally {
      if (requestedReportRef.current === announcement.id) setReportLoading(false)
    }
  }

  return (
    <div className="standard-page announcements-page">
      <PageHeading
        eyebrow={isId ? 'Informasi perusahaan' : 'Company updates'}
        title={isId ? 'Pengumuman' : 'Announcements'}
        detail={canManage
          ? (isId ? 'Buat, kelola, dan pantau siapa yang sudah membaca pengumuman.' : 'Create, manage, and track who has read each announcement.')
          : (isId ? 'Informasi terbaru dari perusahaan untuk Anda.' : 'The latest updates from your company.')}
        action={canManage ? <button className="primary-button" onClick={() => setShowComposer((open) => !open)}><Plus size={17} /> {isId ? 'Buat pengumuman' : 'New announcement'}</button> : undefined}
      />

      {showComposer && <form className="announcement-composer" onSubmit={submit}>
        <div className="announcement-composer-head"><Megaphone size={19} /><strong>{isId ? 'Pengumuman baru' : 'New announcement'}</strong></div>
        <label>{isId ? 'Judul' : 'Title'}<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} autoFocus /></label>
        <label>{isId ? 'Isi pengumuman' : 'Message'}<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} rows={5} /></label>
        <div className="announcement-composer-actions"><button type="button" className="secondary-button" onClick={() => setShowComposer(false)}>{isId ? 'Batal' : 'Cancel'}</button><button className="primary-button" disabled={saving || !title.trim() || !body.trim()}>{saving ? <Loader2 size={17} className="spin" /> : <Send size={17} />}{isId ? 'Terbitkan' : 'Publish'}</button></div>
      </form>}

      {error && <div className="inline-alert" role="alert">{error}</div>}
      {loading ? <div className="announcement-empty"><Loader2 size={20} className="spin" /> {isId ? 'Memuat pengumuman...' : 'Loading announcements...'}</div> : announcements.length === 0 ? <div className="announcement-empty"><Megaphone size={22} /><strong>{isId ? 'Belum ada pengumuman.' : 'No announcements yet.'}</strong></div> : <div className="announcement-list">
        {announcements.map((announcement) => <article key={announcement.id} className={`announcement-card${announcement.isActive ? '' : ' archived'}`}>
          <span className="announcement-icon"><Megaphone size={19} /></span>
          <div className="announcement-content"><div className="announcement-meta"><span>{formatPublishedAt(announcement.publishedAt, isId)}</span><span>{isId ? `Oleh ${announcement.createdBy.displayName}` : `By ${announcement.createdBy.displayName}`}</span>{canManage && <b>{announcement.isActive ? (isId ? 'Aktif' : 'Active') : (isId ? 'Diarsipkan' : 'Archived')}</b>}</div><h2>{announcement.title}</h2><p>{announcement.body}</p>
            {canManage && <button type="button" className="announcement-readers-toggle" aria-expanded={openReport === announcement.id} onClick={() => toggleReport(announcement)}>
              <Users size={15} />
              {isId ? `${announcement.readCount ?? 0} orang sudah membaca` : `Read by ${announcement.readCount ?? 0}`}
            </button>}
          </div>
          {canManage && <button className="icon-button" title={announcement.isActive ? (isId ? 'Arsipkan pengumuman' : 'Archive announcement') : (isId ? 'Aktifkan pengumuman' : 'Restore announcement')} onClick={() => toggleActive(announcement)}>{announcement.isActive ? <Archive size={17} /> : <RotateCcw size={17} />}</button>}

          {canManage && openReport === announcement.id && <div className="announcement-readers">
            {reportLoading || !report ? <div className="announcement-readers-loading"><Loader2 size={17} className="spin" /> {isId ? 'Memuat daftar pembaca...' : 'Loading readers...'}</div> : <>
              <div className="announcement-readers-head">
                <CheckCheck size={16} />
                <strong>{isId ? `${report.readCount} dari ${report.total} pegawai sudah membaca` : `${report.readCount} of ${report.total} employees have read this`}</strong>
              </div>
              <div className="announcement-readers-columns">
                <section>
                  <h3>{isId ? 'Sudah membaca' : 'Read'}</h3>
                  {report.readers.length === 0
                    ? <p className="announcement-readers-empty">{isId ? 'Belum ada yang membaca.' : 'Nobody has read it yet.'}</p>
                    : report.readers.map((person) => <ReaderRow key={person.userId} person={person} isId={isId} />)}
                </section>
                <section>
                  <h3>{isId ? 'Belum membaca' : 'Not yet read'}</h3>
                  {report.pending.length === 0
                    ? <p className="announcement-readers-empty">{isId ? 'Seluruh pegawai sudah membaca.' : 'Everyone has read it.'}</p>
                    : report.pending.map((person) => <ReaderRow key={person.userId} person={person} isId={isId} />)}
                </section>
              </div>
            </>}
          </div>}
        </article>)}
      </div>}
    </div>
  )
}
