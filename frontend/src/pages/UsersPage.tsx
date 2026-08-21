import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ChevronDown, Loader2, Plus, Trash2, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { errorMessage } from '@/api/client'
import { createUser, deleteUser, listUsers } from '@/api/users'
import { userInitials, userRoleLabel } from '@/api/mockUsers'
import type { ApiUser, ApiRole } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

type FilterRole = 'all' | ApiRole

export function UsersPage() {
  const { token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterRole>('all')

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<ApiRole>('EMPLOYEE')
  const [formPassword, setFormPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listUsers(token ?? undefined)
      setUsers(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadUsers() }, [loadUsers])

  const filtered = filter === 'all' ? users : users.filter((u) => u.role === filter)
  const adminCount = users.filter((u) => u.role === 'ADMIN').length
  const employeeCount = users.filter((u) => u.role === 'EMPLOYEE').length

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formEmail.trim()) return
    setIsSubmitting(true)
    setFormError(null)
    try {
      const newUser = await createUser({
        name: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
        password: formPassword || undefined,
      }, token ?? undefined)
      setUsers((prev) => [newUser, ...prev])
      setShowForm(false)
      setFormName('')
      setFormEmail('')
      setFormRole('EMPLOYEE')
      setFormPassword('')
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (user: ApiUser) => {
    if (!confirm(`Hapus ${user.name}?`)) return
    try {
      await deleteUser(user.id, token ?? undefined)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow={isId ? 'Manajemen akses' : 'Access management'}
        title={isId ? 'Orang & akses' : 'People & access'}
        detail={isId ? 'Kelola siapa yang dapat mengakses koleksi dan jawaban AI.' : 'Manage who can access collections and AI answers.'}
        action={
          <button className="primary-button" onClick={() => setShowForm(true)}>
            <Plus size={17} /> {isId ? 'Undang orang' : 'Invite person'}
          </button>
        }
      />

      {/* Role filter */}
      <div className="users-filter">
        <button className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          {isId ? 'Semua' : 'All'} ({users.length})
        </button>
        <button className={`filter-chip ${filter === 'ADMIN' ? 'active' : ''}`} onClick={() => setFilter('ADMIN')}>
          Admin ({adminCount})
        </button>
        <button className={`filter-chip ${filter === 'EMPLOYEE' ? 'active' : ''}`} onClick={() => setFilter('EMPLOYEE')}>
          {isId ? 'Karyawan' : 'Employee'} ({employeeCount})
        </button>
      </div>

      {/* Error banner */}
      {error && <div className="upload-error-banner">{error}</div>}

      {/* Table */}
      {loading ? (
        <div className="users-loading"><Loader2 size={20} className="spin" /> Memuat data pengguna…</div>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>{isId ? 'Orang' : 'Person'}</th>
                <th>Role</th>
                <th>{isId ? 'Akses' : 'Access'}</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="empty-row">Tidak ada pengguna ditemukan.</td></tr>
              ) : filtered.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="person-cell">
                      <span className="avatar">{userInitials(user.name)}</span>
                      <span>
                        <strong>{user.name}</strong>
                        <small>{user.email}</small>
                      </span>
                    </div>
                  </td>
                  <td><span className={`role-badge ${user.role.toLowerCase()}`}>{userRoleLabel(user.role)}</span></td>
                  <td>{user.role === 'ADMIN' ? (isId ? 'Akses penuh' : 'Full access') : (isId ? 'Perpustakaan pengetahuan' : 'Knowledge library')}</td>
                  <td><span className="active-user"><Check size={13} /> {isId ? 'Aktif' : 'Active'}</span></td>
                  <td>
                    <button className="icon-button" title={`Hapus ${user.name}`} onClick={() => handleDelete(user)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create user modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{isId ? 'Undang orang' : 'Invite person'}</h2>
              <button className="icon-button" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate}>
              {formError && <div className="auth-error">{formError}</div>}

              <div className="auth-field">
                <label htmlFor="user-name">Nama</label>
                <input id="user-name" type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="Nama lengkap" />
              </div>

              <div className="auth-field">
                <label htmlFor="user-email">Email</label>
                <input id="user-email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required placeholder="nama@perusahaan.com" />
              </div>

              <div className="auth-field">
                <label htmlFor="user-role">Role</label>
                <div className="select-wrapper">
                  <select id="user-role" value={formRole} onChange={(e) => setFormRole(e.target.value as ApiRole)}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <ChevronDown size={15} className="select-icon" />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="user-password">Password (opsional)</label>
                <input id="user-password" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Kosongkan untuk password default" />
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>{isId ? 'Batal' : 'Cancel'}</button>
                <button type="submit" className="primary-button" disabled={isSubmitting || !formName.trim() || !formEmail.trim()}>
                  {isSubmitting ? <><Loader2 size={15} className="spin" /> {isId ? 'Menambahkan…' : 'Adding…'}</> : <><Plus size={15} /> {isId ? 'Tambah' : 'Add'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
