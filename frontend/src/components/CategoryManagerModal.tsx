import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { FolderOpen, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  createDocumentCategory,
  deleteDocumentCategory,
  listDocumentCategories,
  updateDocumentCategory,
} from '@/api/documents'
import { errorMessage } from '@/api/client'
import type { ApiDocumentCategory } from '@/api/types'
import { useConfirm } from './ConfirmDialog'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

interface CategoryManagerModalProps {
  open: boolean
  onClose: () => void
  /** Daftar kategori terbaru setiap kali ada yang berubah. */
  onChanged: (categories: ApiDocumentCategory[]) => void
  /** Kategori yang baru diganti nama, supaya kolom koleksi dokumen ikut. */
  onRenamed: (categoryId: string, name: string) => void
}

/**
 * Kelola daftar kategori dokumen: tambah, ganti nama, hapus.
 *
 * Sebelumnya kategori hanya bisa lahir — kotak "kategori baru" di dialog
 * unggah — dan tidak pernah bisa mati. Satu salah ketik karena itu menetap
 * selamanya di filter setiap orang, dan kategori percobaan menumpuk di sebelah
 * kategori sungguhan tanpa ada cara membedakannya.
 *
 * Kategori adalah penanda subjek, bukan pagar akses (lihat AGENT.md), jadi
 * mengganti namanya tidak memindahkan hak siapa pun. Yang perlu hati-hati
 * justru menghapus: dokumennya tidak ikut terhapus, tapi penanda subjeknya
 * hilang tanpa bisa dikembalikan — karena itu server menolak menghapus
 * kategori yang masih berisi, dan dialog ini menyebutkan angkanya lebih dulu.
 */
export function CategoryManagerModal({ open, onClose, onChanged, onRenamed }: CategoryManagerModalProps) {
  const { token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const { tanya, dialog: dialogKonfirmasi } = useConfirm()

  const [categories, setCategories] = useState<ApiDocumentCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Kedua kabar ke halaman induk disimpan sebagai ref, bukan dependensi.
  // Halaman induk membuat ulang fungsinya tiap render, dan `onChanged` sendiri
  // membuatnya render ulang — sebagai dependensi, pemuatan daftarnya akan
  // memanggil dirinya sendiri tanpa henti.
  const kabarBerubah = useRef(onChanged)
  const kabarGantiNama = useRef(onRenamed)
  kabarBerubah.current = onChanged
  kabarGantiNama.current = onRenamed

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listDocumentCategories(token ?? undefined)
      setCategories(data)
      kabarBerubah.current(data)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!open) return
    load()
  }, [open, load])

  // Sisa ketikan dari sesi sebelumnya dibuang saat dialog ditutup: kotak yang
  // sudah terisi nama lama membuat orang menekan "Tambah" tanpa membacanya.
  useEffect(() => {
    if (open) return
    setName('')
    setEditingId(null)
    setError(null)
  }, [open])

  if (!open) return null

  const tambah = async (event: FormEvent) => {
    event.preventDefault()
    if (name.trim().length < 2 || saving) return
    setSaving(true)
    setError(null)
    try {
      await createDocumentCategory(name.trim(), token ?? undefined)
      setName('')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const simpanNama = async (category: ApiDocumentCategory) => {
    const nama = editName.trim()
    if (!nama || nama === category.name) { setEditingId(null); return }
    setBusyId(category.id)
    setError(null)
    try {
      const updated = await updateDocumentCategory(category.id, nama, token ?? undefined)
      setEditingId(null)
      kabarGantiNama.current(category.id, updated.name)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const hapus = async (category: ApiDocumentCategory) => {
    const dipakai = category.documentCount ?? 0
    if (dipakai > 0) {
      // Kabar, bukan pertanyaan: tidak ada tombol lanjut karena tidak ada yang
      // bisa dilanjutkan sampai dokumennya dipindahkan.
      await tanya({
        title: isId ? 'Belum bisa dihapus' : 'Cannot be deleted yet',
        body: isId
          ? <><strong>{category.name}</strong> masih dipakai {dipakai} dokumen. Pindahkan dokumennya ke kategori lain dulu lewat tombol atur akses di daftar dokumen, baru kategori ini bisa dihapus.</>
          : <><strong>{category.name}</strong> is still used by {dipakai} {dipakai === 1 ? 'document' : 'documents'}. Move them to another category first, using the access button in the document list, and this category can then be deleted.</>,
        cancelLabel: isId ? 'Tutup' : 'Close',
      })
      return
    }

    const setuju = await tanya({
      title: isId ? 'Hapus kategori' : 'Delete category',
      body: isId
        ? <><strong>{category.name}</strong> tidak dipakai dokumen mana pun, jadi bisa dihapus permanen. Tindakan ini tidak bisa dibatalkan.</>
        : <><strong>{category.name}</strong> is not used by any document, so it can be deleted for good. This cannot be undone.</>,
      confirmLabel: isId ? 'Hapus' : 'Delete',
      cancelLabel: isId ? 'Batal' : 'Cancel',
      tone: 'danger',
    })
    if (!setuju) return

    setBusyId(category.id)
    setError(null)
    try {
      await deleteDocumentCategory(category.id, token ?? undefined)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
    <div className="modal-overlay" onClick={() => !busyId && !saving && onClose()}>
      <div className="modal-card category-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{isId ? 'Kelola kategori' : 'Manage categories'}</h2>
            <p className="modal-copy">
              {isId
                ? `${categories.length} kategori dipakai sebagai penanda subjek dokumen`
                : `${categories.length} categories tag the subject of a document`}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} disabled={Boolean(busyId) || saving}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {error && <div className="upload-error-msg" role="alert">{error}</div>}

          <form className="org-add-form" onSubmit={tambah}>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isId ? 'Nama kategori, mis. Kepegawaian' : 'Category name'}
              minLength={2}
              maxLength={100}
              required
            />
            <button type="submit" className="primary-button" disabled={saving || name.trim().length < 2}>
              {saving ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {isId ? 'Tambah' : 'Add'}
            </button>
          </form>

          <p className="field-hint">
            {isId
              ? 'Kategori menandai subjek dokumen, bukan hak akses. Ganti nama ikut berlaku pada semua dokumennya.'
              : 'A category tags a document’s subject, not who may read it. A rename applies to every document in it.'}
          </p>

          <div className="category-list">
            {loading && categories.length === 0 ? (
              <p className="empty-row"><Loader2 size={15} className="spin" /> {isId ? 'Memuat kategori…' : 'Loading categories…'}</p>
            ) : categories.length === 0 ? (
              <p className="empty-row">{isId ? 'Belum ada kategori.' : 'No categories yet.'}</p>
            ) : categories.map((category) => (
              <div key={category.id} className="category-row">
                <FolderOpen size={15} className="category-row-icon" />
                <div className="category-row-name">
                  {editingId === category.id ? (
                    <input
                      className="org-inline-input"
                      type="text"
                      value={editName}
                      autoFocus
                      maxLength={100}
                      onChange={(event) => setEditName(event.target.value)}
                      onBlur={() => simpanNama(category)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') simpanNama(category)
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                    />
                  ) : (
                    <>
                      <strong>{category.name}</strong>
                      <small>
                        {isId
                          ? `${category.documentCount ?? 0} dokumen`
                          : `${category.documentCount ?? 0} ${(category.documentCount ?? 0) === 1 ? 'document' : 'documents'}`}
                      </small>
                    </>
                  )}
                </div>
                <div className="org-row-actions">
                  {busyId === category.id && <Loader2 size={15} className="spin" />}
                  <button
                    className="icon-button"
                    title={isId ? 'Ganti nama' : 'Rename'}
                    disabled={Boolean(busyId)}
                    onClick={() => { setEditingId(category.id); setEditName(category.name) }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button danger"
                    title={isId ? 'Hapus kategori' : 'Delete category'}
                    disabled={Boolean(busyId)}
                    onClick={() => hapus(category)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} disabled={Boolean(busyId) || saving}>
            {isId ? 'Tutup' : 'Close'}
          </button>
        </div>
      </div>
    </div>
    {dialogKonfirmasi}
    </>
  )
}
