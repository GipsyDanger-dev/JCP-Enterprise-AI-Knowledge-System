import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Building2, Pencil, Plus, Users, X } from 'lucide-react'
import { authHeaders, errorMessage, request } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { PageHeading } from '@/components/PageHeading'

type Organization = { id: string; name: string; aiProfile: string; isActive: boolean; _count: { users: number } }

type WorkspaceMember = {
  id: string
  username: string
  displayName: string
  employeeNumber: string
  division: string
  jobTitle: string
  role: string
  isAdmin: boolean
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

type WorkspaceDetail = { workspace: { id: string; name: string }, members: WorkspaceMember[] }

export function WorkspacesPage() {
  const { user, token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [items, setItems] = useState<Organization[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editing, setEditing] = useState<WorkspaceMember | null>(null)
  const refresh = () => request<Organization[]>('/workspaces', { headers: authHeaders(token ?? undefined) }).then(setItems)
  useEffect(() => {
    if (!user?.isPlatformOwner) return
    refresh().catch((e) => setError(errorMessage(e))).finally(() => setLoading(false))
  }, [token, user?.isPlatformOwner])
  if (!user?.isPlatformOwner) return <Navigate to="/" replace />

  const openMembers = async (id: string) => {
    setError('')
    setDetailLoading(true)
    setEditing(null)
    try {
      setDetail(await request<WorkspaceDetail>(`/workspaces/${id}/members`, { headers: authHeaders(token ?? undefined) }))
    } catch (e) { setError(errorMessage(e)) }
    finally { setDetailLoading(false) }
  }

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

  const submitMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail || !editing) return
    const form = new FormData(event.currentTarget)
    const body: Record<string, string> = {}
    for (const [key, value] of form.entries()) {
      const text = String(value)
      if (text.trim() || key === 'role') body[key] = text
    }
    setSaving(true)
    setError('')
    try {
      await request(`/workspaces/${detail.workspace.id}/members/${editing.id}`, { method: 'PATCH', headers: authHeaders(token ?? undefined), body })
      await openMembers(detail.workspace.id)
      setEditing(null)
      await refresh()
    } catch (e) { setError(errorMessage(e)) }
    finally { setSaving(false) }
  }

  const fields: Array<[string, string, 'text' | 'password', boolean]> = [
    ['name', isId ? 'Nama organisasi' : 'Organization name', 'text', false],
    ['adminName', isId ? 'Nama admin' : 'Admin name', 'text', false],
    ['adminUsername', 'Username admin', 'text', false],
    ['adminPassword', isId ? 'Password admin' : 'Admin password', 'password', false],
    ['employeeNumber', isId ? 'Nomor karyawan (opsional)' : 'Employee number (optional)', 'text', true],
    ['division', isId ? 'Divisi (opsional)' : 'Division (optional)', 'text', true],
    ['jobTitle', isId ? 'Jabatan (opsional)' : 'Job title (optional)', 'text', true],
  ]

  const memberFields: Array<[string, string, boolean]> = [
    ['displayName', isId ? 'Nama tampilan' : 'Display name', false],
    ['username', 'Username', false],
    ['employeeNumber', isId ? 'Nomor karyawan' : 'Employee number', true],
    ['division', isId ? 'Divisi' : 'Division', true],
    ['jobTitle', isId ? 'Jabatan' : 'Job title', true],
  ]

  return <div className="standard-page">
    <PageHeading eyebrow={isId ? 'Administrasi platform' : 'Platform administration'} title={isId ? 'Organisasi' : 'Organizations'} detail={`${items.length} ${isId ? 'workspace organisasi' : 'organization workspaces'}`} action={<button className="primary-button" onClick={() => { setError(''); setOpen(true) }}><Plus size={17} />{isId ? 'Buat organisasi' : 'Create organization'}</button>} />
    {!open && !detail && error && <p className="inline-alert" role="alert">{error}</p>}
    <div className="data-table"><table><thead><tr><th>{isId ? 'Organisasi' : 'Organization'}</th><th>{isId ? 'Anggota' : 'Members'}</th><th>{isId ? 'Profil AI' : 'AI profile'}</th><th>Status</th><th></th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}>
        <td><Building2 size={16} /> {item.name}</td>
        <td>{item._count.users}</td>
        <td>{item.aiProfile === 'sleman' ? 'Sleman' : (isId ? 'Umum' : 'General')}</td>
        <td>{item.isActive ? (isId ? 'Aktif' : 'Active') : (isId ? 'Nonaktif' : 'Inactive')}</td>
        <td><button className="secondary-button" onClick={() => openMembers(item.id)}><Users size={15} />{isId ? 'Kelola anggota' : 'Manage members'}</button></td>
      </tr>)}
      {!items.length && <tr><td colSpan={5}>{loading ? (isId ? 'Memuat...' : 'Loading...') : (isId ? 'Belum ada organisasi.' : 'No organizations yet.')}</td></tr>}
    </tbody></table></div>

    {open && <div className="modal-overlay" onClick={() => !saving && setOpen(false)}><form className="modal-card" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2>{isId ? 'Buat organisasi' : 'Create organization'}</h2><button type="button" className="icon-button" title={isId ? 'Tutup' : 'Close'} disabled={saving} onClick={() => setOpen(false)}><X size={18} /></button></div>
      <div className="modal-body">{fields.map(([name, label, type, optional]) => <div className="upload-field" key={name}><label htmlFor={`org-${name}`}>{label}</label><input id={`org-${name}`} name={name} type={type} required={!optional} minLength={name === 'adminPassword' ? 12 : 2} maxLength={name === 'adminPassword' ? 128 : 80} autoComplete={type === 'password' ? 'new-password' : 'off'} disabled={saving} /></div>)}
        <div className="upload-field"><label htmlFor="org-ai-profile">{isId ? 'Profil AI' : 'AI profile'}</label><select id="org-ai-profile" name="aiProfile" defaultValue="general" disabled={saving}><option value="general">{isId ? 'Umum' : 'General'}</option><option value="sleman">Sleman</option></select></div>
        {error && <p className="inline-alert" role="alert">{error}</p>}
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => setOpen(false)}>{isId ? 'Batal' : 'Cancel'}</button><button className="primary-button" disabled={saving}><Plus size={17} />{saving ? (isId ? 'Menyimpan...' : 'Saving...') : (isId ? 'Buat organisasi' : 'Create organization')}</button></div>
    </form></div>}

    {detail && <div className="modal-overlay" onClick={() => !detailLoading && setDetail(null)}><div className="modal-card" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2><Building2 size={18} /> {detail.workspace.name}</h2><button type="button" className="icon-button" title={isId ? 'Tutup' : 'Close'} disabled={detailLoading} onClick={() => setDetail(null)}><X size={18} /></button></div>
      <div className="modal-body">
        <p className="modal-hint">{isId ? 'Admin ditampilkan lebih dulu. Pilih anggota untuk mengedit profil, peran, atau mereset password.' : 'Admins are listed first. Pick a member to edit their profile, role, or reset the password.'}</p>
        {detailLoading && !editing && <p>{isId ? 'Memuat...' : 'Loading...'}</p>}
        <div className="data-table"><table><thead><tr><th>{isId ? 'Nama' : 'Name'}</th><th>Username</th><th>{isId ? 'Peran' : 'Role'}</th><th>Status</th><th></th></tr></thead><tbody>
          {detail.members.map((member) => <tr key={member.id}>
            <td>{member.displayName}{member.division ? <span className="member-subtext">{member.division}</span> : null}</td>
            <td>{member.username}</td>
            <td><span className={`role-badge ${member.isAdmin ? 'admin' : 'user'}`}>{member.isAdmin ? (isId ? 'Admin' : 'Admin') : (isId ? 'Pegawai' : 'Employee')}</span></td>
            <td>{member.isActive ? (isId ? 'Aktif' : 'Active') : (isId ? 'Nonaktif' : 'Inactive')}</td>
            <td><button className="icon-button" title={isId ? 'Edit anggota' : 'Edit member'} onClick={() => { setError(''); setEditing(member) }}><Pencil size={15} /></button></td>
          </tr>)}
          {!detail.members.length && <tr><td colSpan={5}>{isId ? 'Belum ada anggota.' : 'No members yet.'}</td></tr>}
        </tbody></table></div>
        {error && <p className="inline-alert" role="alert">{error}</p>}
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" disabled={detailLoading} onClick={() => setDetail(null)}>{isId ? 'Tutup' : 'Close'}</button></div>
    </div></div>}

    {detail && editing && <div className="modal-overlay" onClick={() => !saving && setEditing(null)}><form className="modal-card" onSubmit={submitMember} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2>{isId ? 'Edit anggota' : 'Edit member'} — {editing.displayName}</h2><button type="button" className="icon-button" title={isId ? 'Tutup' : 'Close'} disabled={saving} onClick={() => setEditing(null)}><X size={18} /></button></div>
      <div className="modal-body">
        {memberFields.map(([name, label, optional]) => <div className="upload-field" key={name}><label htmlFor={`member-${name}`}>{label}</label><input id={`member-${name}`} name={name} type="text" defaultValue={String((editing as unknown as Record<string, string>)[name] ?? '')} required={!optional} disabled={saving} maxLength={80} /></div>)}
        <div className="upload-field"><label htmlFor="member-role">{isId ? 'Peran' : 'Role'}</label>
          <select id="member-role" name="role" defaultValue={editing.role} disabled={saving}>
            <option value="SUPER_ADMIN">{isId ? 'Admin workspace' : 'Workspace admin'}</option>
            <option value="PEGAWAI">{isId ? 'Pegawai' : 'Employee'}</option>
          </select>
        </div>
        <div className="upload-field"><label htmlFor="member-newPassword">{isId ? 'Password baru (kosongkan bila tidak diubah)' : 'New password (leave empty to keep)'}</label><input id="member-newPassword" name="newPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" disabled={saving} placeholder="••••••••••••" /></div>
        {error && <p className="inline-alert" role="alert">{error}</p>}
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => setEditing(null)}>{isId ? 'Batal' : 'Cancel'}</button><button className="primary-button" disabled={saving}>{saving ? (isId ? 'Menyimpan...' : 'Saving...') : (isId ? 'Simpan' : 'Save')}</button></div>
    </form></div>}
  </div>
}
