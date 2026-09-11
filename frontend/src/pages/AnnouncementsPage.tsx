import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Archive, Check, CheckCheck, Loader2, Megaphone, Pencil, Plus, RotateCcw, Send, Trash2, Users, X } from 'lucide-react'
import {
  createAnnouncement,
  deleteAnnouncement,
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

/**
 * Form yang sama dipakai untuk menerbitkan dan menyunting — isian serta batas
 * panjangnya identik, jadi memisahkan keduanya hanya membuka peluang melenceng.
 * Nilai awal disalin ke state sendiri: menyunting sebuah pengumuman tidak boleh
 * mengubah tampilan kartunya sebelum perubahan itu benar-benar tersimpan.
 */
function AnnouncementForm({ heading, submitLabel, submitIcon, initial, saving, isId, inline, onSubmit, onCancel }: {
  heading: string
  submitLabel: string
  submitIcon: ReactNode
  initial?: { title: string; body: string }
  saving: boolean
  isId: boolean
  inline?: boolean
  onSubmit: (values: { title: string; body: string }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !body.trim()) return
    onSubmit({ title: title.trim(), body: body.trim() })
  }

  return (
    <form className={`announcement-composer${inline ? ' inline' : ''}`} onSubmit={submit}>
      <div className="announcement-composer-head"><Megaphone size={19} /><strong>{heading}</strong></div>
      <label>{isId ? 'Judul' : 'Title'}<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} autoFocus /></label>
      <label>{isId ? 'Isi pengumuman' : 'Message'}<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} rows={5} /></label>
      <div className="announcement-composer-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>{isId ? 'Batal' : 'Cancel'}</button>
        <button className="primary-button" disabled={saving || !title.trim() || !body.trim()}>{saving ? <Loader2 size={17} className="spin" /> : submitIcon}{submitLabel}</button>
      </div>
    </form>
  )
}

export function AnnouncementsPage() {
  const { token, user } = useAuth()
  const { language, markAnnouncementsSeen } = useWorkspace()
  const isId = language === 'id'
  // Ditanyakan ke server: yang boleh menerbitkan bukan hanya admin, melainkan
  // juga jabatan yang dicentang wewenangnya — dan centang itu hanya dipegang
  // backend. Melihat siapa saja yang sudah membaca adalah wewenang tersendiri,
  // jadi dilacak terpisah.
  const [canManage, setCanManage] = useState(user?.isAdmin ?? false)
  const [canViewReaders, setCanViewReaders] = useState(user?.isAdmin ?? false)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [showComposer, setShowComposer] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Pengumuman yang sedang ditanyakan penghapusannya. Ditahan di state, bukan
  // window.confirm, supaya dialognya sebentuk dengan dialog hapus dokumen.
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null)
  // Galat penghapusan punya tempatnya sendiri: alert di halaman berada di balik
  // overlay dialog, jadi tidak akan terbaca justru saat paling dibutuhkan.
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Pengumuman yang sedang disimpan atau dihapus — dipakai mematikan tombol di
  // kartu itu saja, bukan seluruh daftar.
  const [busyId, setBusyId] = useState<string | null>(null)
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
      .then(({ canPublish, canViewReaders: boleh }) => {
        if (cancelled) return
        setCanManage(canPublish)
        setCanViewReaders(boleh)
      })
      .catch(() => {
        if (cancelled) return
        setCanManage(user?.isAdmin ?? false)
        setCanViewReaders(user?.isAdmin ?? false)
      })
    return () => { cancelled = true }
  }, [token, user?.isAdmin])

  // Membuka halaman ini berarti pengumuman sudah dibaca — badge dibersihkan
  // dan bukti bacanya tercatat per pengumuman di server.
  useEffect(() => { markAnnouncementsSeen() }, [markAnnouncementsSeen])

  const publish = async (values: { title: string; body: string }) => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const announcement = await createAnnouncement(values, token)
      setAnnouncements((items) => [announcement, ...items])
      setShowComposer(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const replaceInList = (updated: Announcement) => setAnnouncements((items) => items.map((item) => item.id === updated.id ? updated : item))

  const saveEdit = async (announcement: Announcement, values: { title: string; body: string }) => {
    if (!token) return
    setBusyId(announcement.id)
    setError(null)
    try {
      replaceInList(await updateAnnouncement(announcement.id, values, token))
      setEditingId(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const toggleActive = async (announcement: Announcement) => {
    if (!token) return
    setBusyId(announcement.id)
    setError(null)
    try {
      replaceInList(await updateAnnouncement(announcement.id, { isActive: !announcement.isActive }, token))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Hapus permanen. Arsip yang sekadar menyembunyikan sudah punya tombolnya
   * sendiri, jadi di sini penghapusannya ditegaskan dulu lewat dialog: catatan
   * pembacanya ikut hilang dan tidak bisa dikembalikan.
   */
  const confirmDelete = async () => {
    const announcement = pendingDelete
    if (!token || !announcement) return
    setBusyId(announcement.id)
    setDeleteError(null)
    try {
      await deleteAnnouncement(announcement.id, token)
      setAnnouncements((items) => items.filter((item) => item.id !== announcement.id))
      setPendingDelete(null)
      if (editingId === announcement.id) setEditingId(null)
      if (openReport === announcement.id) {
        setOpenReport(null)
        setReport(null)
        requestedReportRef.current = null
      }
    } catch (err) {
      setDeleteError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const askDelete = (announcement: Announcement) => {
    setDeleteError(null)
    setPendingDelete(announcement)
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

  const deleting = pendingDelete !== null && busyId === pendingDelete.id

  // Esc menutup dialog konfirmasi — kebiasaan yang dibawa pengguna dari dialog
  // bawaan browser yang digantikannya. Ditahan selagi penghapusan berjalan.
  useEffect(() => {
    if (!pendingDelete || deleting) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setPendingDelete(null) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingDelete, deleting])

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

      {showComposer && <AnnouncementForm
        heading={isId ? 'Pengumuman baru' : 'New announcement'}
        submitLabel={isId ? 'Terbitkan' : 'Publish'}
        submitIcon={<Send size={17} />}
        saving={saving}
        isId={isId}
        onSubmit={publish}
        onCancel={() => setShowComposer(false)}
      />}

      {error && <div className="inline-alert" role="alert">{error}</div>}
      {loading ? <div className="announcement-empty"><Loader2 size={20} className="spin" /> {isId ? 'Memuat pengumuman...' : 'Loading announcements...'}</div> : announcements.length === 0 ? <div className="announcement-empty"><Megaphone size={22} /><strong>{isId ? 'Belum ada pengumuman.' : 'No announcements yet.'}</strong></div> : <div className="announcement-list">
        {announcements.map((announcement) => {
          const editing = canManage && editingId === announcement.id
          const busy = busyId === announcement.id
          return <article key={announcement.id} className={`announcement-card${!announcement.isActive && !editing ? ' archived' : ''}`}>
            <span className="announcement-icon">{editing ? <Pencil size={19} /> : <Megaphone size={19} />}</span>
            {editing ? <AnnouncementForm
              inline
              heading={isId ? 'Sunting pengumuman' : 'Edit announcement'}
              submitLabel={isId ? 'Simpan perubahan' : 'Save changes'}
              submitIcon={<Check size={17} />}
              initial={{ title: announcement.title, body: announcement.body }}
              saving={busy}
              isId={isId}
              onSubmit={(values) => saveEdit(announcement, values)}
              onCancel={() => setEditingId(null)}
            /> : <>
              <div className="announcement-content"><div className="announcement-meta"><span>{formatPublishedAt(announcement.publishedAt, isId)}</span><span>{isId ? `Oleh ${announcement.createdBy.displayName}` : `By ${announcement.createdBy.displayName}`}</span>{canManage && <b>{announcement.isActive ? (isId ? 'Aktif' : 'Active') : (isId ? 'Diarsipkan' : 'Archived')}</b>}</div><h2>{announcement.title}</h2><p>{announcement.body}</p>
                {canViewReaders && <button type="button" className="announcement-readers-toggle" aria-expanded={openReport === announcement.id} onClick={() => toggleReport(announcement)}>
                  <Users size={15} />
                  {isId ? `${announcement.readCount ?? 0} orang sudah membaca` : `Read by ${announcement.readCount ?? 0}`}
                </button>}
              </div>
              {canManage && <div className="announcement-actions">
                <button className="icon-button" disabled={busy} title={isId ? 'Sunting pengumuman' : 'Edit announcement'} onClick={() => setEditingId(announcement.id)}><Pencil size={17} /></button>
                <button className="icon-button" disabled={busy} title={announcement.isActive ? (isId ? 'Arsipkan pengumuman' : 'Archive announcement') : (isId ? 'Aktifkan pengumuman' : 'Restore announcement')} onClick={() => toggleActive(announcement)}>{announcement.isActive ? <Archive size={17} /> : <RotateCcw size={17} />}</button>
                <button className="icon-button danger" disabled={busy} title={isId ? 'Hapus permanen' : 'Delete permanently'} onClick={() => askDelete(announcement)}>{busy ? <Loader2 size={17} className="spin" /> : <Trash2 size={17} />}</button>
              </div>}
            </>}

            {canViewReaders && openReport === announcement.id && <div className="announcement-readers">
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
          </article>
        })}
      </div>}

      {pendingDelete && <div className="modal-overlay" onClick={() => !deleting && setPendingDelete(null)}>
        <div className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-announcement-title" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <h2 id="delete-announcement-title">{isId ? 'Hapus pengumuman' : 'Delete announcement'}</h2>
            <button type="button" className="icon-button" aria-label={isId ? 'Tutup' : 'Close'} disabled={deleting} onClick={() => setPendingDelete(null)}><X size={18} /></button>
          </div>
          <div className="modal-body">
            <p className="modal-copy">{isId
              ? <>Pengumuman <strong>{pendingDelete.title}</strong> akan dihapus permanen beserta catatan siapa saja yang sudah membacanya. Tindakan ini tidak bisa dibatalkan.</>
              : <>Announcement <strong>{pendingDelete.title}</strong> will be permanently deleted along with the record of who has read it. This action cannot be undone.</>}</p>
            {/* Arsip lebih sering yang sebenarnya dimaksud, jadi disebut di sini selagi masih bisa dibatalkan. */}
            <p className="modal-copy">{isId
              ? 'Kalau hanya ingin menyembunyikannya dari pegawai, pakai tombol arsipkan — pengumuman yang diarsipkan masih bisa diaktifkan lagi.'
              : 'To just hide it from employees, use archive instead — an archived announcement can be restored later.'}</p>
            {deleteError && <div className="inline-alert" role="alert">{deleteError}</div>}
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" disabled={deleting} onClick={() => setPendingDelete(null)}>{isId ? 'Batal' : 'Cancel'}</button>
            <button type="button" className="danger-button" disabled={deleting} autoFocus onClick={confirmDelete}>{deleting ? <><Loader2 size={15} className="spin" /> {isId ? 'Menghapus...' : 'Deleting...'}</> : <><Trash2 size={15} /> {isId ? 'Hapus pengumuman' : 'Delete announcement'}</>}</button>
          </div>
        </div>
      </div>}
    </div>
  )
}
