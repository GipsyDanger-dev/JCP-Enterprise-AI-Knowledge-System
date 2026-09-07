import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Building2, Plus, X } from 'lucide-react'
import { authHeaders, errorMessage, request } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { PageHeading } from '@/components/PageHeading'

type Organization = { id: string; name: string; aiProfile: string; isActive: boolean; _count: { users: number } }

export function WorkspacesPage() {
  const { user, token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [items, setItems] = useState<Organization[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = () => request<Organization[]>('/workspaces', { headers: authHeaders(token ?? undefined) }).then(setItems)
  useEffect(() => {
    if (!user?.isPlatformOwner) return
    refresh().catch((e) => setError(errorMessage(e))).finally(() => setLoading(false))
  }, [token, user?.isPlatformOwner])
  if (!user?.isPlatformOwner) return <Navigate to="/" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = Object.fromEntries(new FormData(event.currentTarget))
    setSaving(true)
    setError('')
    try {
      await request('/workspaces', { method: 'POST', headers: authHeaders(token ?? undefined), body })
      await refresh()
      setOpen(false)
    } catch (e) { setError(errorMessage(e)) }
    finally { setSaving(false) }
  }

  const fields = [
    ['name', isId ? 'Nama organisasi' : 'Organization name', 'text'],
    ['adminName', isId ? 'Nama admin' : 'Admin name', 'text'],
    ['adminUsername', 'Username admin', 'text'],
    ['adminPassword', isId ? 'Password admin' : 'Admin password', 'password'],
    ['employeeNumber', isId ? 'Nomor karyawan' : 'Employee number', 'text'],
    ['division', isId ? 'Divisi' : 'Division', 'text'],
    ['jobTitle', isId ? 'Jabatan' : 'Job title', 'text'],
  ]
  return <div className="standard-page">
    <PageHeading eyebrow={isId ? 'Administrasi platform' : 'Platform administration'} title={isId ? 'Organisasi' : 'Organizations'} detail={`${items.length} ${isId ? 'workspace organisasi' : 'organization workspaces'}`} action={<button className="primary-button" onClick={() => { setError(''); setOpen(true) }}><Plus size={17} />{isId ? 'Buat organisasi' : 'Create organization'}</button>} />
    {!open && error && <p className="inline-alert" role="alert">{error}</p>}
    <div className="data-table"><table><thead><tr><th>{isId ? 'Organisasi' : 'Organization'}</th><th>{isId ? 'Anggota' : 'Members'}</th><th>{isId ? 'Profil AI' : 'AI profile'}</th><th>Status</th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><td><Building2 size={16} /> {item.name}</td><td>{item._count.users}</td><td>{item.aiProfile === 'sleman' ? 'Sleman' : (isId ? 'Umum' : 'General')}</td><td>{item.isActive ? (isId ? 'Aktif' : 'Active') : (isId ? 'Nonaktif' : 'Inactive')}</td></tr>)}
      {!items.length && <tr><td colSpan={4}>{loading ? (isId ? 'Memuat...' : 'Loading...') : (isId ? 'Belum ada organisasi.' : 'No organizations yet.')}</td></tr>}
    </tbody></table></div>
    {open && <div className="modal-overlay" onClick={() => !saving && setOpen(false)}><form className="modal-card" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2>{isId ? 'Buat organisasi' : 'Create organization'}</h2><button type="button" className="icon-button" title={isId ? 'Tutup' : 'Close'} disabled={saving} onClick={() => setOpen(false)}><X size={18} /></button></div>
      <div className="modal-body">{fields.map(([name, label, type]) => <div className="upload-field" key={name}><label htmlFor={`org-${name}`}>{label}</label><input id={`org-${name}`} name={name} type={type} required minLength={name === 'adminPassword' ? 12 : 2} maxLength={name === 'adminPassword' ? 128 : 80} autoComplete={type === 'password' ? 'new-password' : 'off'} disabled={saving} /></div>)}
        <div className="upload-field"><label htmlFor="org-ai-profile">{isId ? 'Profil AI' : 'AI profile'}</label><select id="org-ai-profile" name="aiProfile" defaultValue="general" disabled={saving}><option value="general">{isId ? 'Umum' : 'General'}</option><option value="sleman">Sleman</option></select></div>
        {error && <p className="inline-alert" role="alert">{error}</p>}
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => setOpen(false)}>{isId ? 'Batal' : 'Cancel'}</button><button className="primary-button" disabled={saving}><Plus size={17} />{saving ? (isId ? 'Menyimpan...' : 'Saving...') : (isId ? 'Buat organisasi' : 'Create organization')}</button></div>
    </form></div>}
  </div>
}
