import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { errorMessage } from '@/api/client'
import {
  createJabatan,
  createUnitKerja,
  deleteJabatan,
  deleteUnitKerja,
  getOrganization,
  updateJabatan,
  updateRoleLabel,
  updateUnitKerja,
} from '@/api/organization'
import type { JabatanInput, OrganizationOverview, OrgJabatan, OrgUnitKerja } from '@/api/organization'
import type { ApiRole, ApiRoleLabel } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

export type OrganizationSection = 'unit-kerja' | 'jabatan' | 'role'

interface Props {
  section: OrganizationSection
  /** Dipanggil setelah daftar berubah, supaya dropdown di form akun ikut segar. */
  onChanged?: () => void
}

/**
 * Pengelola daftar acuan: unit kerja, jabatan, dan istilah role.
 *
 * Ketiganya dulu konstanta di backend, jadi menambah satu jabatan berarti
 * menunggu deploy. Dipisah dari daftar pengguna karena isinya bukan orang,
 * melainkan kerangka tempat orang ditaruh — tetapi tetap serumah di halaman
 * Orang & akses supaya admin tidak perlu berpindah menu saat mendapati pilihan
 * yang dibutuhkannya belum ada.
 */
export function OrganizationManager({ section, onChanged }: Props) {
  const { token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [data, setData] = useState<OrganizationOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getOrganization(token ?? undefined))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  // Perubahan apa pun menyegarkan seluruh daftar: jumlah pemakai di kolom
  // "dipakai" bisa ikut bergeser, dan angka yang basi di situ justru menyesatkan
  // saat admin memutuskan boleh-tidaknya sesuatu dihapus.
  const afterChange = useCallback(async () => {
    await load()
    onChanged?.()
  }, [load, onChanged])

  if (loading && !data) {
    return <div className="users-loading"><Loader2 size={20} className="spin" /> {isId ? 'Memuat daftar…' : 'Loading…'}</div>
  }

  return (
    <>
      {error && <div className="upload-error-banner">{error}</div>}
      {data && section === 'unit-kerja' && (
        <UnitKerjaSection units={data.unitKerja} isId={isId} token={token} onError={setError} onChanged={afterChange} />
      )}
      {data && section === 'jabatan' && (
        <JabatanSection items={data.jabatan} isId={isId} token={token} onError={setError} onChanged={afterChange} />
      )}
      {data && section === 'role' && (
        <RoleSection labels={data.roleLabels} isId={isId} token={token} onError={setError} onChanged={afterChange} />
      )}
    </>
  )
}

interface SectionProps {
  isId: boolean
  token: string | null
  onError: (message: string | null) => void
  onChanged: () => Promise<void> | void
}

// ------------------------------------------------------------------ unit kerja

function UnitKerjaSection({ units, isId, token, onError, onChanged }: SectionProps & { units: OrgUnitKerja[] }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !code.trim()) return
    setSaving(true)
    onError(null)
    try {
      await createUnitKerja({ name: name.trim(), code: code.trim().toUpperCase() }, token ?? undefined)
      setName('')
      setCode('')
      await onChanged()
    } catch (err) {
      onError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const simpanNama = async (unit: OrgUnitKerja) => {
    if (!editName.trim() || editName.trim() === unit.name) { setEditingId(null); return }
    onError(null)
    try {
      await updateUnitKerja(unit.id, { name: editName.trim() }, token ?? undefined)
      setEditingId(null)
      await onChanged()
    } catch (err) {
      onError(errorMessage(err))
    }
  }

  const ubahStatus = async (unit: OrgUnitKerja) => {
    onError(null)
    try {
      await updateUnitKerja(unit.id, { isActive: !unit.isActive }, token ?? undefined)
      await onChanged()
    } catch (err) {
      onError(errorMessage(err))
    }
  }

  const hapus = async (unit: OrgUnitKerja) => {
    const pesan = isId
      ? `Hapus unit kerja "${unit.name}"?\n\nHanya bisa dihapus kalau belum dipakai pengguna maupun dokumen.`
      : `Delete work unit "${unit.name}"?\n\nOnly possible when no user or document still refers to it.`
    if (!confirm(pesan)) return
    onError(null)
    try {
      await deleteUnitKerja(unit.id, token ?? undefined)
      await onChanged()
    } catch (err) {
      onError(errorMessage(err))
    }
  }

  return (
    <>
      <form className="org-add-form" onSubmit={handleCreate}>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={isId ? 'Nama unit kerja, mis. Dinas Pertanian' : 'Work unit name'}
          minLength={2}
          maxLength={120}
          required
        />
        <input
          type="text"
          className="org-code-input"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder={isId ? 'KODE' : 'CODE'}
          pattern="[A-Z0-9_]{2,30}"
          title={isId ? 'Huruf kapital, angka, dan garis bawah' : 'Capital letters, digits, and underscores'}
          maxLength={30}
          required
        />
        <button type="submit" className="primary-button" disabled={saving || !name.trim() || !code.trim()}>
          {saving ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {isId ? 'Tambah' : 'Add'}
        </button>
      </form>
      <p className="field-hint org-section-hint">
        {isId
          ? 'Unit kerja menentukan dokumen mana yang terlihat pegawainya. Kode dipakai sebagai kunci dan tidak bisa diubah setelah dibuat.'
          : 'The work unit decides which documents its members can see. The code is the key and cannot be changed afterwards.'}
      </p>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>{isId ? 'Unit kerja' : 'Work unit'}</th>
              <th>{isId ? 'Kode' : 'Code'}</th>
              <th>{isId ? 'Dipakai' : 'In use'}</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {units.length === 0 ? (
              <tr><td colSpan={5} className="empty-row">{isId ? 'Belum ada unit kerja.' : 'No work units yet.'}</td></tr>
            ) : units.map((unit) => (
              <tr key={unit.id}>
                <td>
                  {editingId === unit.id ? (
                    <input
                      className="org-inline-input"
                      type="text"
                      value={editName}
                      autoFocus
                      onChange={(event) => setEditName(event.target.value)}
                      onBlur={() => simpanNama(unit)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') simpanNama(unit)
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                    />
                  ) : <strong>{unit.name}</strong>}
                </td>
                <td><code className="org-code">{unit.code}</code></td>
                <td>
                  {isId
                    ? `${unit.userCount} pengguna · ${unit.documentCount} dokumen`
                    : `${unit.userCount} users · ${unit.documentCount} docs`}
                </td>
                <td>
                  {unit.isActive
                    ? <span className="active-user"><Check size={13} /> {isId ? 'Aktif' : 'Active'}</span>
                    : <span className="inactive-user"><X size={13} /> {isId ? 'Nonaktif' : 'Inactive'}</span>}
                </td>
                <td>
                  <div className="org-row-actions">
                    <button
                      className="icon-button"
                      title={isId ? 'Ganti nama' : 'Rename'}
                      onClick={() => { setEditingId(unit.id); setEditName(unit.name) }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button className="link-button org-toggle" onClick={() => ubahStatus(unit)}>
                      {unit.isActive ? (isId ? 'Nonaktifkan' : 'Deactivate') : (isId ? 'Aktifkan' : 'Activate')}
                    </button>
                    <button className="icon-button danger" title={isId ? 'Hapus' : 'Delete'} onClick={() => hapus(unit)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// --------------------------------------------------------------------- jabatan

function JabatanSection({ items, isId, token, onError, onChanged }: SectionProps & { items: OrgJabatan[] }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  // Id yang permintaannya sedang berjalan, supaya centang tidak bisa diklik dua
  // kali sebelum jawaban pertamanya sampai.
  const [busy, setBusy] = useState<string | null>(null)

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    onError(null)
    try {
      await createJabatan({ name: name.trim() }, token ?? undefined)
      setName('')
      await onChanged()
    } catch (err) {
      onError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const ubah = async (jabatan: OrgJabatan, input: JabatanInput) => {
    setBusy(jabatan.id)
    onError(null)
    try {
      await updateJabatan(jabatan.id, input, token ?? undefined)
      await onChanged()
    } catch (err) {
      onError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const simpanNama = async (jabatan: OrgJabatan) => {
    if (!editName.trim() || editName.trim() === jabatan.name) { setEditingId(null); return }
    await ubah(jabatan, { name: editName.trim() })
    setEditingId(null)
  }

  const hapus = async (jabatan: OrgJabatan) => {
    const pesan = isId
      ? `Hapus jabatan "${jabatan.name}"?\n\nHanya bisa dihapus kalau belum dipegang siapa pun.`
      : `Delete job title "${jabatan.name}"?\n\nOnly possible when nobody holds it.`
    if (!confirm(pesan)) return
    onError(null)
    try {
      await deleteJabatan(jabatan.id, token ?? undefined)
      await onChanged()
    } catch (err) {
      onError(errorMessage(err))
    }
  }

  return (
    <>
      <form className="org-add-form" onSubmit={handleCreate}>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={isId ? 'Nama jabatan, mis. Kepala Bidang' : 'Job title, e.g. Division Head'}
          minLength={2}
          maxLength={120}
          required
        />
        <button type="submit" className="primary-button" disabled={saving || !name.trim()}>
          {saving ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {isId ? 'Tambah' : 'Add'}
        </button>
      </form>
      <p className="field-hint org-section-hint">
        {isId
          ? 'Jabatan tidak menentukan dokumen apa yang terlihat — itu urusan unit kerja. Yang diatur di sini hanya wewenang atas pengumuman dan bacaan wajib. Admin selalu punya ketiganya tanpa perlu dicentang.'
          : 'Job titles do not decide document access — work units do. What is set here is only authority over announcements and required readings. Admins always have all three.'}
      </p>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>{isId ? 'Jabatan' : 'Job title'}</th>
              <th className="org-check-col">{isId ? 'Kelola pengumuman' : 'Manage announcements'}</th>
              <th className="org-check-col">{isId ? 'Lihat pembaca' : 'View readers'}</th>
              <th className="org-check-col">{isId ? 'Tugaskan bacaan wajib' : 'Assign required reading'}</th>
              <th>{isId ? 'Pemegang' : 'Holders'}</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="empty-row">{isId ? 'Belum ada jabatan.' : 'No job titles yet.'}</td></tr>
            ) : items.map((jabatan) => (
              <tr key={jabatan.id}>
                <td>
                  {editingId === jabatan.id ? (
                    <input
                      className="org-inline-input"
                      type="text"
                      value={editName}
                      autoFocus
                      onChange={(event) => setEditName(event.target.value)}
                      onBlur={() => simpanNama(jabatan)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') simpanNama(jabatan)
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                    />
                  ) : <strong>{jabatan.name}</strong>}
                </td>
                <PermissionCell
                  checked={jabatan.canManageAnnouncements}
                  disabled={busy === jabatan.id}
                  onChange={(value) => ubah(jabatan, { canManageAnnouncements: value })}
                />
                <PermissionCell
                  checked={jabatan.canViewAnnouncementReaders}
                  disabled={busy === jabatan.id}
                  onChange={(value) => ubah(jabatan, { canViewAnnouncementReaders: value })}
                />
                <PermissionCell
                  checked={jabatan.canAssignRequiredReadings}
                  disabled={busy === jabatan.id}
                  onChange={(value) => ubah(jabatan, { canAssignRequiredReadings: value })}
                />
                <td>{isId ? `${jabatan.userCount} pengguna` : `${jabatan.userCount} users`}</td>
                <td>
                  {jabatan.isActive
                    ? <span className="active-user"><Check size={13} /> {isId ? 'Aktif' : 'Active'}</span>
                    : <span className="inactive-user"><X size={13} /> {isId ? 'Nonaktif' : 'Inactive'}</span>}
                </td>
                <td>
                  <div className="org-row-actions">
                    <button
                      className="icon-button"
                      title={isId ? 'Ganti nama' : 'Rename'}
                      onClick={() => { setEditingId(jabatan.id); setEditName(jabatan.name) }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button className="link-button org-toggle" onClick={() => ubah(jabatan, { isActive: !jabatan.isActive })}>
                      {jabatan.isActive ? (isId ? 'Nonaktifkan' : 'Deactivate') : (isId ? 'Aktifkan' : 'Activate')}
                    </button>
                    <button className="icon-button danger" title={isId ? 'Hapus' : 'Delete'} onClick={() => hapus(jabatan)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PermissionCell({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <td className="org-check-col">
      <input
        type="checkbox"
        className="org-checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </td>
  )
}

// ------------------------------------------------------------------ nama role

/**
 * Hanya istilahnya yang bisa diganti, dan daftarnya selalu tiga.
 *
 * Wewenang tiap role tertanam di kode backend, jadi role bikinan baru tidak
 * akan punya aturan apa pun di baliknya dan hanya akan berperilaku seperti
 * pegawai biasa. Yang benar-benar dibutuhkan di lapangan memang cuma
 * penyesuaian istilah, dan itu yang disediakan di sini.
 */
function RoleSection({ labels, isId, token, onError, onChanged }: SectionProps & { labels: ApiRoleLabel[] }) {
  return (
    <>
      <p className="field-hint org-section-hint">
        {isId
          ? 'Role adalah tingkat wewenang atas dokumen dan pengguna, dan perilakunya ditetapkan di sistem — jadi jumlahnya tetap tiga. Yang bisa disesuaikan di sini hanya istilah yang dipakai instansi Anda. Untuk wewenang yang bisa dipasang-lepas, pakai centang di tab Jabatan.'
          : 'Roles are authority levels over documents and users, and their behaviour is fixed in the system — so there are always three. What you can adjust here is only the wording your organisation uses. For authority you can grant and revoke, use the checkboxes under Job titles.'}
      </p>
      <div className="org-role-list">
        {labels.map((item) => (
          <RoleCard
            key={item.role}
            item={item}
            // Nama role lain, untuk menahan nama kembar sebelum dikirim.
            namaTerpakai={labels.filter((lain) => lain.role !== item.role).map((lain) => lain.label)}
            isId={isId}
            token={token}
            onError={onError}
            onChanged={onChanged}
          />
        ))}
      </div>
    </>
  )
}

/** Perilaku tetap tiap role, ditampilkan supaya penamaan ulang tidak menyesatkan. */
const WEWENANG_TETAP: Record<string, { id: string; en: string }> = {
  SUPER_ADMIN: {
    id: 'Mengelola seluruh dokumen, pengguna, unit kerja, dan pengaturan workspace.',
    en: 'Manages all documents, users, work units, and workspace settings.',
  },
  ADMIN_UNIT: {
    id: 'Mengunggah dan mengelola dokumen milik unit kerjanya sendiri, bukan unit lain.',
    en: 'Uploads and manages documents owned by their own work unit only.',
  },
  PEGAWAI: {
    id: 'Membaca dan bertanya pada dokumen yang terbuka untuk unit kerjanya.',
    en: 'Reads and queries documents open to their work unit.',
  },
}

function RoleCard({ item, namaTerpakai, isId, token, onError, onChanged }: SectionProps & { item: ApiRoleLabel; namaTerpakai: string[] }) {
  const [label, setLabel] = useState(item.label)
  const [description, setDescription] = useState(item.description ?? '')
  const [saving, setSaving] = useState(false)
  const berubah = label.trim() !== item.label || description.trim() !== (item.description ?? '')
  // Nama role adalah satu-satunya pembeda di dropdown Role — nilai enum-nya
  // tidak pernah terlihat. Diberitahukan sambil mengetik, bukan setelah simpan
  // ditolak server, supaya tidak perlu menebak nama mana yang bentrok.
  const kembar = namaTerpakai.some((nama) => nama.trim().toLowerCase() === label.trim().toLowerCase())

  const simpan = async (event: FormEvent) => {
    event.preventDefault()
    if (!label.trim() || kembar) return
    setSaving(true)
    onError(null)
    try {
      await updateRoleLabel(item.role as ApiRole, { label: label.trim(), description: description.trim() || undefined }, token ?? undefined)
      await onChanged()
    } catch (err) {
      onError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="org-role-card" onSubmit={simpan}>
      <div className="org-role-head">
        <code className="org-code">{item.role}</code>
        <span className="org-role-fixed">{isId ? WEWENANG_TETAP[item.role]?.id : WEWENANG_TETAP[item.role]?.en}</span>
      </div>
      <div className="auth-field">
        <label>{isId ? 'Nama tampilan' : 'Display name'}</label>
        <input
          type="text"
          className={kembar ? 'org-input-invalid' : undefined}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          minLength={2}
          maxLength={60}
          required
        />
        {kembar && <p className="org-field-error">
          {isId ? 'Nama ini sudah dipakai role lain. Tiap role harus berbeda namanya.' : 'Another role already uses this name. Each role needs a distinct name.'}
        </p>}
      </div>
      <div className="auth-field">
        <label>{isId ? 'Keterangan' : 'Description'}</label>
        <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} />
      </div>
      <button type="submit" className="secondary-button" disabled={saving || !berubah || !label.trim() || kembar}>
        {saving ? <><Loader2 size={15} className="spin" /> {isId ? 'Menyimpan…' : 'Saving…'}</> : (isId ? 'Simpan' : 'Save')}
      </button>
    </form>
  )
}
