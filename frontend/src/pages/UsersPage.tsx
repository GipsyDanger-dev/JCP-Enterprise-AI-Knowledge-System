import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Camera, Check, ChevronDown, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { errorMessage } from '@/api/client'
import { changePassword, createUser, deleteUser, getUserReferenceData, listUsers, updateUser } from '@/api/users'
import { userInitials, userRoleLabel } from '@/utils/users'
import { prepareProfilePhoto } from '@/utils/profilePhoto'
import type { ApiUser, ApiRole, ApiUnitKerja } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

// 'employee' sengaja bukan nilai role: yang dimaksud tombolnya adalah "semua
// yang bukan admin", termasuk akun lama dengan role warisan.
type FilterRole = 'all' | 'SUPER_ADMIN' | 'employee'

export function UsersPage() {
  const { token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterRole>('all')
  // Daftar acuan dropdown. Unit kerja datang dari database supaya daftarnya bisa
  // direvisi tanpa deploy ulang; jabatan hanya keterangan dan tidak memengaruhi akses.
  const [unitKerjaList, setUnitKerjaList] = useState<ApiUnitKerja[]>([])
  const [jabatanList, setJabatanList] = useState<string[]>([])

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formEmployeeNumber, setFormEmployeeNumber] = useState('')
  const [formJobTitle, setFormJobTitle] = useState('')
  const [formUnitKerjaId, setFormUnitKerjaId] = useState('')
  const [formRole, setFormRole] = useState<ApiRole>('PEGAWAI')
  const [formPassword, setFormPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Edit form
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null)
  const [editName, setEditName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editEmployeeNumber, setEditEmployeeNumber] = useState('')
  const [editJobTitle, setEditJobTitle] = useState('')
  const [editUnitKerjaId, setEditUnitKerjaId] = useState('')
  const [editRole, setEditRole] = useState<ApiRole>('PEGAWAI')
  const [editPhoto, setEditPhoto] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const editPhotoRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    getUserReferenceData(token ?? undefined)
      .then((data) => {
        setUnitKerjaList(data.unitKerja)
        setJabatanList(data.jabatan)
      })
      // Gagal memuat daftar acuan tidak boleh menghalangi halaman: dropdown
      // tampil kosong dan pesannya sudah cukup jelas dari sana.
      .catch(() => undefined)
  }, [token])

  // Divisi dan unit kerja harus selalu sejalan: yang tampil di daftar adalah
  // teks `division`, sedangkan yang menentukan akses adalah `unitKerjaId`.
  const unitKerjaName = (id: string) => unitKerjaList.find((unit) => unit.id === id)?.name ?? ''

  const filtered =
    filter === 'all'
      ? users
      : filter === 'SUPER_ADMIN'
        ? users.filter((u) => u.role === 'SUPER_ADMIN')
        : users.filter((u) => u.role !== 'SUPER_ADMIN')
  const adminCount = users.filter((u) => u.role === 'SUPER_ADMIN').length
  const employeeCount = users.filter((u) => u.role !== 'SUPER_ADMIN').length

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formUsername.trim() || !formEmployeeNumber.trim() || !formUnitKerjaId || !formJobTitle.trim()) return
    setIsSubmitting(true)
    setFormError(null)
    try {
      const newUser = await createUser({
        displayName: formName.trim(),
        username: formUsername.trim(),
        employeeNumber: formEmployeeNumber.trim(),
        division: unitKerjaName(formUnitKerjaId),
        jobTitle: formJobTitle.trim(),
        role: formRole,
        unitKerjaId: formUnitKerjaId,
        password: formPassword || undefined,
      }, token ?? undefined)
      setUsers((prev) => [newUser, ...prev])
      setShowForm(false)
      setFormName('')
      setFormUsername('')
      setFormEmployeeNumber('')
      setFormUnitKerjaId('')
      setFormJobTitle('')
      setFormRole('PEGAWAI')
      setFormPassword('')
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (user: ApiUser) => {
    const msg = isId
      ? `Nonaktifkan ${user.displayName}?\n\nPengguna ini tidak akan bisa login lagi.`
      : `Deactivate ${user.displayName}?\n\nThis user will no longer be able to log in.`
    if (!confirm(msg)) return
    try {
      await deleteUser(user.id, token ?? undefined)
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, isActive: false } : u))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const openEdit = (user: ApiUser) => {
    setEditingUser(user)
    setEditName(user.displayName)
    setEditUsername(user.username)
    setEditEmployeeNumber(user.employeeNumber)
    setEditUnitKerjaId(user.unitKerjaId ?? '')
    setEditJobTitle(user.jobTitle)
    setEditRole(user.role)
    setEditPhoto(user.photoUrl ?? '')
    setEditPassword('')
    setEditError(null)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEditError(null)
    try {
      setEditPhoto(await prepareProfilePhoto(file))
    } catch (err) {
      setEditError(isId ? errorMessage(err) : 'Unable to prepare this photo. Choose another image.')
    } finally {
      e.target.value = ''
    }
  }

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingUser || !editName.trim()) return
    setEditSaving(true)
    setEditError(null)
    try {
      const updated = await updateUser(editingUser.id, {
        displayName: editName.trim(),
        username: editUsername.trim(),
        employeeNumber: editEmployeeNumber.trim(),
        division: unitKerjaName(editUnitKerjaId) || editingUser.division,
        jobTitle: editJobTitle.trim(),
        role: editRole,
        unitKerjaId: editUnitKerjaId || undefined,
        isAdmin: editRole === 'SUPER_ADMIN',
        photoUrl: editPhoto || undefined,
      }, token ?? undefined)
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u))
      if (editPassword.trim()) {
        await changePassword(editingUser.id, editPassword, token ?? undefined)
      }
      setEditingUser(null)
    } catch (err) {
      setEditError(errorMessage(err))
    } finally {
      setEditSaving(false)
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
        <button className={`filter-chip ${filter === 'SUPER_ADMIN' ? 'active' : ''}`} onClick={() => setFilter('SUPER_ADMIN')}>
          Admin ({adminCount})
        </button>
        <button className={`filter-chip ${filter === 'employee' ? 'active' : ''}`} onClick={() => setFilter('employee')}>
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
                      {user.photoUrl
                        ? <img className="avatar user-photo-avatar" src={user.photoUrl} alt={`${user.displayName} profile`} />
                        : <span className="avatar">{userInitials(user.displayName)}</span>}
                      <span>
                        <strong>{user.displayName}</strong>
                        <small>@{user.username}</small>
                      </span>
                    </div>
                  </td>
                  <td><span className={`role-badge ${user.role.toLowerCase()}`}>{userRoleLabel(user.role)}</span></td>
                  <td>{user.role === 'SUPER_ADMIN'
                    ? (isId ? 'Akses penuh' : 'Full access')
                    : user.unitKerja?.name
                      ?? (isId ? 'Belum ditempatkan' : 'No work unit')}</td>
                  <td>{user.isActive !== false
                    ? <span className="active-user"><Check size={13} /> {isId ? 'Aktif' : 'Active'}</span>
                    : <span className="inactive-user"><X size={13} /> {isId ? 'Nonaktif' : 'Inactive'}</span>
                  }</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="icon-button" title={isId ? `Edit ${user.displayName}` : `Edit ${user.displayName}`} onClick={() => openEdit(user)}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-button" title={isId ? `Hapus ${user.displayName}` : `Delete ${user.displayName}`} onClick={() => handleDelete(user)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit user modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{isId ? 'Edit pengguna' : 'Edit user'}</h2>
              <button className="icon-button" onClick={() => setEditingUser(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {editError && <div className="auth-error">{editError}</div>}

                <div className="auth-field">
                  <label>{isId ? 'Nama' : 'Name'}</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required placeholder={isId ? 'Nama lengkap' : 'Full name'} />
                </div>

                <div className="auth-field">
                  <label>{isId ? 'Username' : 'Username'}</label>
                  <input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} required placeholder={isId ? 'username' : 'username'} minLength={3} maxLength={50} autoComplete="username" />
                </div>

                <div className="auth-field">
                  <label>{isId ? 'Nomor karyawan' : 'Employee number'}</label>
                  <input type="text" value={editEmployeeNumber} onChange={(e) => setEditEmployeeNumber(e.target.value)} required placeholder={isId ? 'Contoh: EMP-0001' : 'Example: EMP-0001'} minLength={2} maxLength={50} />
                </div>

                <div className="auth-field">
                  <label>{isId ? 'Divisi / Unit kerja' : 'Division / Work unit'}</label>
                  <div className="select-wrapper">
                    <select value={editUnitKerjaId} onChange={(e) => setEditUnitKerjaId(e.target.value)} required>
                      <option value="">{isId ? '— Pilih unit kerja —' : '— Select work unit —'}</option>
                      {unitKerjaList.map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="select-icon" />
                  </div>
                  <p className="field-hint">{isId ? 'Menentukan dokumen mana yang bisa dilihat pengguna ini.' : 'Determines which documents this user can see.'}</p>
                </div>

                <div className="auth-field">
                  <label>{isId ? 'Jabatan' : 'Job title'}</label>
                  <div className="select-wrapper">
                    <select value={editJobTitle} onChange={(e) => setEditJobTitle(e.target.value)} required>
                      <option value="">{isId ? '— Pilih jabatan —' : '— Select job title —'}</option>
                      {jabatanList.map((jabatan) => (
                        <option key={jabatan} value={jabatan}>{jabatan}</option>
                      ))}
                      {/* Jabatan lama yang tidak ada di daftar tetap ditampilkan supaya
                          menyunting pengguna lawas tidak diam-diam mengubah jabatannya. */}
                      {editJobTitle && !jabatanList.includes(editJobTitle) && (
                        <option value={editJobTitle}>{editJobTitle}</option>
                      )}
                    </select>
                    <ChevronDown size={15} className="select-icon" />
                  </div>
                </div>

                <div className="auth-field">
                  <label>{isId ? 'Role' : 'Role'}</label>
                  <div className="select-wrapper">
                    <select value={editRole} onChange={(e) => setEditRole(e.target.value as ApiRole)}>
                      <option value="SUPER_ADMIN">Super Admin</option>
                      <option value="PEGAWAI">Pegawai</option>
                    </select>
                    <ChevronDown size={15} className="select-icon" />
                  </div>
                </div>

                <div className="auth-field">
                  <label>{isId ? 'Foto profil' : 'Profile photo'}</label>
                  <div className="edit-photo-field">
                    {editPhoto ? (
                      <div className="edit-photo-preview">
                        <img src={editPhoto} alt="" />
                        <button type="button" className="edit-photo-remove" onClick={() => setEditPhoto('')}><X size={14} /></button>
                      </div>
                    ) : (
                      <button type="button" className="edit-photo-upload" onClick={() => editPhotoRef.current?.click()}>
                        <Camera size={20} />
                        <span>{isId ? 'Pilih foto' : 'Choose photo'}</span>
                      </button>
                    )}
                    <input ref={editPhotoRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                    {editPhoto && (
                      <button type="button" className="edit-photo-change" onClick={() => editPhotoRef.current?.click()}>
                        {isId ? 'Ganti foto' : 'Change photo'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="auth-field">
                  <label>{isId ? 'Password baru (opsional)' : 'New password (optional)'}</label>
                  <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder={isId ? 'Kosongkan jika tidak diubah' : 'Leave empty to keep current'} minLength={8} />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setEditingUser(null)}>{isId ? 'Batal' : 'Cancel'}</button>
                <button type="submit" className="primary-button" disabled={editSaving || !editName.trim()}>
                  {editSaving ? <><Loader2 size={15} className="spin" /> {isId ? 'Menyimpan…' : 'Saving…'}</> : (isId ? 'Simpan' : 'Save')}
                </button>
              </div>
            </form>
          </div>
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
              <div className="modal-body">
                {formError && <div className="auth-error">{formError}</div>}

                <div className="auth-field">
                  <label htmlFor="user-name">Nama</label>
                  <input id="user-name" type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="Nama lengkap" />
                </div>

                <div className="auth-field">
                  <label htmlFor="user-username">Username</label>
                  <input id="user-username" type="text" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} required placeholder="username" minLength={3} maxLength={50} autoComplete="username" />
                </div>

                <div className="auth-field">
                  <label htmlFor="user-employee-number">{isId ? 'Nomor karyawan' : 'Employee number'}</label>
                  <input id="user-employee-number" type="text" value={formEmployeeNumber} onChange={(e) => setFormEmployeeNumber(e.target.value)} required placeholder="EMP-0001" minLength={2} maxLength={50} />
                </div>

                <div className="auth-field">
                  <label htmlFor="user-division">{isId ? 'Divisi / Unit kerja' : 'Division / Work unit'}</label>
                  <div className="select-wrapper">
                    <select id="user-division" value={formUnitKerjaId} onChange={(e) => setFormUnitKerjaId(e.target.value)} required>
                      <option value="">{isId ? '— Pilih unit kerja —' : '— Select work unit —'}</option>
                      {unitKerjaList.map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="select-icon" />
                  </div>
                  <p className="field-hint">{isId ? 'Menentukan dokumen mana yang bisa dilihat pengguna ini.' : 'Determines which documents this user can see.'}</p>
                </div>

                <div className="auth-field">
                  <label htmlFor="user-job-title">{isId ? 'Jabatan' : 'Job title'}</label>
                  <div className="select-wrapper">
                    <select id="user-job-title" value={formJobTitle} onChange={(e) => setFormJobTitle(e.target.value)} required>
                      <option value="">{isId ? '— Pilih jabatan —' : '— Select job title —'}</option>
                      {jabatanList.map((jabatan) => (
                        <option key={jabatan} value={jabatan}>{jabatan}</option>
                      ))}
                      {/* Jabatan lama yang tidak ada di daftar tetap ditampilkan supaya
                          menyunting pengguna lawas tidak diam-diam mengubah jabatannya. */}
                      {formJobTitle && !jabatanList.includes(formJobTitle) && (
                        <option value={formJobTitle}>{formJobTitle}</option>
                      )}
                    </select>
                    <ChevronDown size={15} className="select-icon" />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="user-role">Role</label>
                  <div className="select-wrapper">
                    <select id="user-role" value={formRole} onChange={(e) => setFormRole(e.target.value as ApiRole)}>
                      <option value="SUPER_ADMIN">Super Admin</option>
                      <option value="PEGAWAI">Pegawai</option>
                    </select>
                    <ChevronDown size={15} className="select-icon" />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="user-password">Password (opsional)</label>
                  <input id="user-password" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Kosongkan untuk password default" />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>{isId ? 'Batal' : 'Cancel'}</button>
                <button type="submit" className="primary-button" disabled={isSubmitting || !formName.trim() || !formUsername.trim() || !formEmployeeNumber.trim() || !formUnitKerjaId || !formJobTitle.trim()}>
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
