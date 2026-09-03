import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Archive, Loader2, Megaphone, Plus, RotateCcw, Send } from 'lucide-react'
import { createAnnouncement, listAnnouncements, type Announcement, updateAnnouncement } from '@/api/announcements'
import { errorMessage } from '@/api/client'
import { PageHeading } from '@/components/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

const formatPublishedAt = (value: string, isId: boolean) => new Date(value).toLocaleDateString(isId ? 'id-ID' : 'en-US', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export function AnnouncementsPage() {
  const { token } = useAuth()
  const { language, role, markAnnouncementsSeen } = useWorkspace()
  const isId = language === 'id'
  const canManage = role === 'admin'
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [showComposer, setShowComposer] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Membuka halaman ini berarti pengumuman sudah dibaca — badge dibersihkan.
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

  return (
    <div className="standard-page announcements-page">
      <PageHeading
        eyebrow={isId ? 'Informasi perusahaan' : 'Company updates'}
        title={isId ? 'Pengumuman' : 'Announcements'}
        detail={canManage
          ? (isId ? 'Buat dan kelola pengumuman untuk seluruh karyawan.' : 'Create and manage updates for every employee.')
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
          <div className="announcement-content"><div className="announcement-meta"><span>{formatPublishedAt(announcement.publishedAt, isId)}</span><span>{isId ? `Oleh ${announcement.createdBy.displayName}` : `By ${announcement.createdBy.displayName}`}</span>{canManage && <b>{announcement.isActive ? (isId ? 'Aktif' : 'Active') : (isId ? 'Diarsipkan' : 'Archived')}</b>}</div><h2>{announcement.title}</h2><p>{announcement.body}</p></div>
          {canManage && <button className="icon-button" title={announcement.isActive ? (isId ? 'Arsipkan pengumuman' : 'Archive announcement') : (isId ? 'Aktifkan pengumuman' : 'Restore announcement')} onClick={() => toggleActive(announcement)}>{announcement.isActive ? <Archive size={17} /> : <RotateCcw size={17} />}</button>}
        </article>)}
      </div>}
    </div>
  )
}
