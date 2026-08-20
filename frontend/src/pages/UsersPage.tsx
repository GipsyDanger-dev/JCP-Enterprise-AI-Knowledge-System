import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ChevronDown, Loader2, Plus, Trash2, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { errorMessage } from '@/api/client'
import { createUser, deleteUser, listUsers } from '@/api/users'
import type { ApiUser, ApiRole } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'
import { userAccessLabel, userInitials, userRoleLabel } from '@/utils/user'

type FilterRole = 'all' | ApiRole

export function UsersPage() {
  const { token, user: currentUser } = useAuth()
  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterRole>('all')

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<ApiRole>('USER')
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
  const employeeCount = users.filter((u) => u.role === 'USER').length
  const passwordInvalid = formPassword.length > 0 && (formPassword.length < 12 || formPassword.length > 128)

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formEmail.trim()) return
    if (formPassword.length < 12 || formPassword.length > 128) {
      setFormError('Password wajib terdiri dari 12 sampai 128 karakter.')
      return
    }
    setIsSubmitting(true)
    setFormError(null)
    try {
      const newUser = await createUser({
        displayName: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
        password: formPassword,
      }, token ?? undefined)
      setUsers((prev) => [newUser, ...prev])
      setShowForm(false)
      setFormName('')
      setFormEmail('')
      setFormRole('USER')
      setFormPassword('')
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (user: ApiUser) => {
    if (!confirm(`Deactivate ${user.displayName}?`)) return
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
        eyebrow="Access management"
        title="People & access"
        detail="Manage authenticated users and their assigned roles."
        action={
          <button className="primary-button" onClick={() => setShowForm(true)}>
            <Plus size={17} /> Add user
          </button>
        }
      />

      {/* Role filter */}
      <div className="users-filter">
        <button className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          All ({users.length})
        </button>
        <button className={`filter-chip ${filter === 'ADMIN' ? 'active' : ''}`} onClick={() => setFilter('ADMIN')}>
          Admin ({adminCount})
        </button>
        <button className={`filter-chip ${filter === 'USER' ? 'active' : ''}`} onClick={() => setFilter('USER')}>
          Employee ({employeeCount})
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
                <th>Person</th>
                <th>Role</th>
                <th>Access</th>
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
                      <span className="avatar">{userInitials(user.displayName)}</span>
                      <span>
                        <strong>{user.displayName}</strong>
                        <small>{user.email}</small>
                      </span>
                    </div>
                  </td>
                  <td><span className={`role-badge ${user.role === 'ADMIN' ? 'admin' : 'employee'}`}>{userRoleLabel(user.role)}</span></td>
                  <td>{userAccessLabel(user.role)}</td>
                  <td><span className="active-user"><Check size={13} /> Active</span></td>
                  <td>{user.id !== currentUser?.id && (
                    <button className="icon-button" title={`Deactivate ${user.displayName}`} onClick={() => handleDelete(user)}>
                      <Trash2 size={15} />
                    </button>
                  )}</td>
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
              <h2>Add user</h2>
              <button className="icon-button" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate}>
              {formError && <div className="auth-error">{formError}</div>}

              <div className="auth-field">
                <label htmlFor="user-name">Nama</label>
                <input id="user-name" type="text" value={formName} onChange={(e) => setFormName(e.target.value)} minLength={2} maxLength={100} required placeholder="Nama lengkap" />
              </div>

              <div className="auth-field">
                <label htmlFor="user-email">Email</label>
                <input id="user-email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} maxLength={254} required placeholder="nama@perusahaan.com" />
              </div>

              <div className="auth-field">
                <label htmlFor="user-role">Role</label>
                <div className="select-wrapper">
                  <select id="user-role" value={formRole} onChange={(e) => setFormRole(e.target.value as ApiRole)}>
                    <option value="USER">Employee</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <ChevronDown size={15} className="select-icon" />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="user-password">Password</label>
                <input
                  id="user-password"
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                  aria-invalid={passwordInvalid}
                  placeholder="Minimal 12 karakter"
                />
                <small>Password wajib terdiri dari 12 sampai 128 karakter.</small>
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Batal</button>
                <button type="submit" className="primary-button" disabled={isSubmitting || !formName.trim() || !formEmail.trim() || formPassword.length < 12 || formPassword.length > 128}>
                  {isSubmitting ? <><Loader2 size={15} className="spin" /> Creating...</> : <><Plus size={15} /> Create user</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
