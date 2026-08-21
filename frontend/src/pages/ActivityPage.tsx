import { useEffect, useState } from 'react'
import { FileText, Key, Loader2, MessageCircle, Settings, Upload, UserPlus } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { listAuditLogs, type AuditLogEntry } from '@/api/auditLogs'

const ACTION_LABELS: Record<string, { id: string; en: string }> = {
  AUTH_LOGIN: { id: 'Login', en: 'Login' },
  USER_CREATED: { id: 'Membuat pengguna', en: 'Created user' },
  USER_UPDATED: { id: 'Mengubah pengguna', en: 'Updated user' },
  DOCUMENT_UPLOADED: { id: 'Mengunggah dokumen', en: 'Uploaded document' },
  DOCUMENT_DELETED: { id: 'Menghapus dokumen', en: 'Deleted document' },
  PROCESSING_JOB_CLAIMED: { id: 'Memproses dokumen', en: 'Processing document' },
  PROCESSING_JOB_COMPLETED: { id: 'Dokumen selesai diproses', en: 'Document processed' },
  PROCESSING_JOB_FAILED: { id: 'Gagal memproses dokumen', en: 'Document processing failed' },
}

const ACTION_ICONS: Record<string, typeof Upload> = {
  AUTH_LOGIN: Key,
  USER_CREATED: UserPlus,
  USER_UPDATED: Settings,
  DOCUMENT_UPLOADED: Upload,
  DOCUMENT_DELETED: FileText,
  PROCESSING_JOB_CLAIMED: Settings,
  PROCESSING_JOB_COMPLETED: FileText,
  PROCESSING_JOB_FAILED: FileText,
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Baru saja'
  if (diffMin < 60) return `${diffMin} menit lalu`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} jam lalu`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} hari lalu`
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ActivityPage() {
  const { token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listAuditLogs(token ?? undefined, 50)
      .then((res) => setEntries(res.data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow={isId ? 'Ruang kerja' : 'Workspace'}
        title={isId ? 'Log aktivitas' : 'Activity log'}
        detail={isId ? 'Aktivitas terbaru di ruang kerja pengetahuan Anda.' : 'Recent activity across your knowledge workspace.'}
      />

      {loading ? (
        <div className="users-loading"><Loader2 size={20} className="spin" /> {isId ? 'Memuat…' : 'Loading…'}</div>
      ) : entries.length === 0 ? (
        <div className="empty-row">{isId ? 'Belum ada aktivitas.' : 'No activity yet.'}</div>
      ) : (
        <div className="activity-log-list">
          {entries.map((entry) => {
            const label = ACTION_LABELS[entry.action] ?? { id: entry.action, en: entry.action }
            const Icon = ACTION_ICONS[entry.action] ?? Settings
            const userName = entry.actorUser?.displayName ?? (entry.actorType === 'WORKER' ? 'System' : 'User')
            return (
              <div key={entry.id} className="activity-log-item">
                <span className={`activity-dot ${entry.action.includes('DOCUMENT') ? 'upload' : entry.action.includes('USER') ? 'user' : entry.action.includes('PROCESSING') ? 'index' : 'query'}`}>
                  <Icon size={14} />
                </span>
                <div>
                  <p>{isId ? label.id : label.en} — <strong>{userName}</strong></p>
                  <div className="activity-meta">
                    <small>{entry.targetType}</small>
                    <small>{formatTime(entry.createdAt)}</small>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
