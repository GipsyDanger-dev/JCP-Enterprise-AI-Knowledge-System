import { PageHeading } from '@/components/PageHeading'
import { useWorkspace } from '@/hooks/useWorkspace'

interface ActivityEntry {
  id: number
  type: 'upload' | 'index' | 'query' | 'user' | 'system'
  message: string
  user: string
  time: string
}

const ACTIVITIES_EN: ActivityEntry[] = [
  { id: 1, type: 'upload', message: 'Uploaded <strong>SOP Perjalanan Dinas 2026.pdf</strong> to Operations', user: 'Adam R.', time: '2 minutes ago' },
  { id: 2, type: 'index', message: '<strong>SOP Perjalanan Dinas 2026.pdf</strong> indexing completed — 42 chunks', user: 'System', time: '5 minutes ago' },
  { id: 3, type: 'query', message: 'Asked: "What is the hotel allowance for managers?"', user: 'Nadia S.', time: '18 minutes ago' },
  { id: 4, type: 'upload', message: 'Uploaded <strong>Employee Handbook 2026.pdf</strong> to People', user: 'Adam R.', time: '1 hour ago' },
  { id: 5, type: 'index', message: '<strong>Employee Handbook 2026.pdf</strong> indexing completed — 61 chunks', user: 'System', time: '1 hour ago' },
  { id: 6, type: 'query', message: 'Asked: "Summarize our procurement approval flow"', user: 'Nadia S.', time: '2 hours ago' },
  { id: 7, type: 'user', message: 'New employee account created: <strong>Nadia S.</strong> (Employee)', user: 'Adam R.', time: '3 hours ago' },
  { id: 8, type: 'upload', message: 'Uploaded <strong>Kebijakan Keamanan Informasi.docx</strong> to IT & Security', user: 'Adam R.', time: 'Yesterday, 09:16' },
  { id: 9, type: 'system', message: 'Workspace <strong>Jogja Creative</strong> initialized', user: 'System', time: 'Yesterday, 08:00' },
  { id: 10, type: 'user', message: 'Admin account created: <strong>Adam R.</strong> (Admin)', user: 'System', time: 'Yesterday, 08:00' },
]

const ACTIVITIES_ID: ActivityEntry[] = [
  { id: 1, type: 'upload', message: 'Mengunggah <strong>SOP Perjalanan Dinas 2026.pdf</strong> ke Operations', user: 'Adam R.', time: '2 menit lalu' },
  { id: 2, type: 'index', message: '<strong>SOP Perjalanan Dinas 2026.pdf</strong> indeks selesai — 42 chunk', user: 'System', time: '5 menit lalu' },
  { id: 3, type: 'query', message: 'Bertanya: "Berapa tunjangan hotel untuk manajer?"', user: 'Nadia S.', time: '18 menit lalu' },
  { id: 4, type: 'upload', message: 'Mengunggah <strong>Employee Handbook 2026.pdf</strong> ke People', user: 'Adam R.', time: '1 jam lalu' },
  { id: 5, type: 'index', message: '<strong>Employee Handbook 2026.pdf</strong> indeks selesai — 61 chunk', user: 'System', time: '1 jam lalu' },
  { id: 6, type: 'query', message: 'Bertanya: "Ringkas alur persetujuan procurement kami"', user: 'Nadia S.', time: '2 jam lalu' },
  { id: 7, type: 'user', message: 'Akun karyawan baru dibuat: <strong>Nadia S.</strong> (Karyawan)', user: 'Adam R.', time: '3 jam lalu' },
  { id: 8, type: 'upload', message: 'Mengunggah <strong>Kebijakan Keamanan Informasi.docx</strong> ke IT & Security', user: 'Adam R.', time: 'Kemarin, 09:16' },
  { id: 9, type: 'system', message: 'Workspace <strong>Jogja Creative</strong> diinisialisasi', user: 'System', time: 'Kemarin, 08:00' },
  { id: 10, type: 'user', message: 'Akun admin dibuat: <strong>Adam R.</strong> (Admin)', user: 'System', time: 'Kemarin, 08:00' },
]

export function ActivityPage() {
  const { language } = useWorkspace()
  const isId = language === 'id'
  const ACTIVITIES = isId ? ACTIVITIES_ID : ACTIVITIES_EN

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow={isId ? 'Ruang kerja' : 'Workspace'}
        title={isId ? 'Log aktivitas' : 'Activity log'}
        detail={isId ? 'Aktivitas terbaru di ruang kerja pengetahuan Anda.' : 'Recent activity across your knowledge workspace.'}
      />

      <div className="activity-log-list">
        {ACTIVITIES.map((entry) => (
            <div key={entry.id} className="activity-log-item">
              <span className={`activity-dot ${entry.type}`} />
              <div>
                <p dangerouslySetInnerHTML={{ __html: entry.message }} />
                <div className="activity-meta">
                  <small>{entry.user}</small>
                  <small>{entry.time}</small>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
