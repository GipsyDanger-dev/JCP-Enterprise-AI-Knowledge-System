import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Building2, CheckCircle2, FileText, FolderOpen, LoaderCircle, Plus, Scale, Upload, X } from 'lucide-react'
import { createDocumentCategory, listDocumentCategories, uploadDocument } from '@/api/documents'
import { getUserReferenceData } from '@/api/users'
import { errorMessage } from '@/api/client'
import type { ApiDocument, ApiDocumentCategory, ApiLegalStatus, ApiUnitKerja } from '@/api/types'
import { LEGAL_STATUSES, legalStatusHint, legalStatusLabel } from '@/utils/legalStatus'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useScrollToError } from '@/hooks/useScrollToError'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt']
// Batas satu antrean. Server menerima satu file per permintaan, jadi angka ini
// bukan batas teknis — hanya menjaga daftar tetap bisa diperiksa satu per satu
// sebelum dikirim, dan antrean AI tidak dibanjiri sekali klik.
const MAX_FILES = 20

type QueueState = 'idle' | 'uploading' | 'done' | 'error'

interface QueueItem {
  key: string
  file: File
  title: string
  categoryId: string
  legalStatus: ApiLegalStatus
  state: QueueState
  error?: string
}

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUploaded: (document: ApiDocument) => void
}

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`

export function UploadModal({ open, onClose, onUploaded }: UploadModalProps) {
  const { token, user } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const fileRef = useRef<HTMLInputElement>(null)

  // Kategori dibaca dari server dan sudah tersaring untuk pengguna ini, jadi
  // tidak mungkin mengunggah ke kategori yang unit kerjanya sendiri tak berhak.
  const [categories, setCategories] = useState<ApiDocumentCategory[]>([])
  const [unitKerjaList, setUnitKerjaList] = useState<ApiUnitKerja[]>([])
  const [items, setItems] = useState<QueueItem[]>([])
  // Nilai yang diwarisi file yang baru ditambahkan. Ikut berubah setiap kali
  // pengaturan "untuk semua file" dipakai, supaya file susulan tidak diam-diam
  // kembali ke BERLAKU tanpa kategori.
  const [defaultCategoryId, setDefaultCategoryId] = useState('')
  // Bawaannya BERLAKU, sama seperti kolomnya di database. Yang penting di sini
  // adalah RANCANGAN punya jalan masuk sama sekali: sebelumnya naskah yang
  // belum ditetapkan tetap tersimpan sebagai berlaku, langsung terbaca seluruh
  // pegawai dan ikut dikutip AI.
  const [defaultLegalStatus, setDefaultLegalStatus] = useState<ApiLegalStatus>('BERLAKU')
  const [newCategory, setNewCategory] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [categorySaving, setCategorySaving] = useState(false)
  // Bawaannya terbuka. Isi JDIH adalah peraturan daerah yang memang publik,
  // jadi mengunci harus jadi keputusan sadar admin — bukan sesuatu yang
  // terjadi diam-diam pada setiap unggahan. Pengunggah lewat jabatan tidak
  // punya pilihan ini: dokumennya selalu bertanda unitnya sendiri (ditegakkan server).
  // Berlaku untuk seluruh antrean; pengecualian per dokumen diatur belakangan
  // lewat tombol atur akses di daftar dokumen.
  const [restrictToUnit, setRestrictToUnit] = useState(false)
  const [unitKerjaId, setUnitKerjaId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useScrollToError<HTMLDivElement>(error)

  const isSuperAdmin = user?.isAdmin ?? false
  const isPersonal = user?.accountType === 'PERSONAL'
  const ownUnit = user?.unitKerja ?? null
  const isBatch = items.length > 1

  // Nilai bersama seluruh antrean; null berarti tiap file berbeda. Sebelum ada
  // file, yang ditampilkan adalah bawaan yang akan diwarisi file pertama.
  const shared = <K extends 'categoryId' | 'legalStatus'>(field: K, fallback: QueueItem[K]): QueueItem[K] | null => {
    if (!items.length) return fallback
    return items.every((item) => item[field] === items[0][field]) ? items[0][field] : null
  }
  const sharedCategoryId = shared('categoryId', defaultCategoryId)
  const sharedLegalStatus = shared('legalStatus', defaultLegalStatus)

  const updateItem = (key: string, patch: Partial<QueueItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))

  const applyCategoryToAll = (id: string) => {
    setDefaultCategoryId(id)
    setItems((current) => current.map((item) => (item.state === 'done' ? item : { ...item, categoryId: id })))
  }

  const applyLegalStatusToAll = (status: ApiLegalStatus) => {
    setDefaultLegalStatus(status)
    setItems((current) => current.map((item) => (item.state === 'done' ? item : { ...item, legalStatus: status })))
  }

  const saveCategory = async () => {
    if (newCategory.trim().length < 2 || categorySaving) return
    setCategorySaving(true)
    try {
      const category = await createDocumentCategory(newCategory.trim(), token ?? undefined)
      setCategories((list) => [...list, category].sort((a, b) => a.name.localeCompare(b.name)))
      applyCategoryToAll(category.id)
      setNewCategory('')
      setAddingCategory(false)
      setError(null)
    } catch (e) { setError(errorMessage(e)) }
    finally { setCategorySaving(false) }
  }

  useEffect(() => {
    if (!open) return
    listDocumentCategories(token ?? undefined).then(setCategories).catch(() => setCategories([]))
    // Hanya super admin yang boleh memilih unit kerja selain miliknya sendiri.
    if (isSuperAdmin) {
      getUserReferenceData(token ?? undefined)
        .then((data) => setUnitKerjaList(data.unitKerja))
        .catch(() => setUnitKerjaList([]))
    }
  }, [open, token, isSuperAdmin])

  if (!open) return null

  const addFiles = (list: FileList | null) => {
    if (!list?.length || uploading) return
    const rejected: string[] = []
    const known = new Set(items.map((item) => item.key))
    const accepted: QueueItem[] = []

    for (const file of Array.from(list)) {
      const key = fileKey(file)
      if (known.has(key)) continue
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
        rejected.push(`${file.name} — ${isId ? 'format tidak didukung' : 'unsupported format'}`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name} — ${isId ? 'lebih dari 10 MB' : 'larger than 10 MB'}`)
        continue
      }
      if (items.length + accepted.length >= MAX_FILES) {
        rejected.push(`${file.name} — ${isId ? `melebihi ${MAX_FILES} file per unggahan` : `over ${MAX_FILES} files per upload`}`)
        continue
      }
      known.add(key)
      accepted.push({ key, file, title: '', categoryId: defaultCategoryId, legalStatus: defaultLegalStatus, state: 'idle' })
    }

    if (accepted.length) setItems((current) => [...current, ...accepted])
    setError(rejected.length
      ? `${isId ? 'Tidak ditambahkan' : 'Not added'}: ${rejected.join('; ')}. ${isId ? 'Hanya PDF, DOCX, dan TXT maks 10 MB.' : 'Only PDF, DOCX, and TXT up to 10 MB.'}`
      : null)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files)
    event.target.value = ''
  }

  const resetForm = () => {
    setItems([])
    setDefaultCategoryId('')
    setDefaultLegalStatus('BERLAKU')
    setRestrictToUnit(false)
    setUnitKerjaId('')
    setError(null)
  }

  const handleUpload = async () => {
    const pending = items.filter((item) => item.state !== 'done')
    if (!pending.length) return
    setUploading(true)
    setError(null)

    // Berurutan, bukan serentak: setiap unggahan langsung memicu ekstraksi dan
    // embedding di layanan AI, dan kegagalan satu file tidak boleh menghentikan
    // sisanya.
    let failed = 0
    for (const [index, item] of pending.entries()) {
      setProgress({ current: index + 1, total: pending.length })
      updateItem(item.key, { state: 'uploading', error: undefined })
      try {
        const document = await uploadDocument(item.file, token ?? undefined, {
          title: item.title,
          categoryId: item.categoryId || undefined,
          // Pengunggah non-admin tidak mengirim id apa pun: server yang mengisikan unit
          // kerjanya sendiri, sehingga nilai dari klien tidak bisa dipakai
          // menandai dokumen atas nama unit lain.
          unitKerjaId: isSuperAdmin ? (restrictToUnit ? unitKerjaId || undefined : undefined) : undefined,
          // Akun pribadi tidak punya pilihan ini: dokumennya hanya terlihat
          // olehnya sendiri, jadi status keberlakuan tidak menentukan apa pun.
          legalStatus: isPersonal ? undefined : item.legalStatus,
        })
        updateItem(item.key, { state: 'done' })
        onUploaded(document)
      } catch (err) {
        failed += 1
        updateItem(item.key, { state: 'error', error: errorMessage(err) })
      }
    }

    setUploading(false)
    if (!failed) {
      resetForm()
      onClose()
      return
    }
    // Yang sudah masuk dikeluarkan dari antrean supaya tombol unggah berikutnya
    // hanya mengirim ulang yang gagal, bukan membuat dokumen ganda.
    setItems((current) => current.filter((item) => item.state !== 'done'))
    const succeeded = pending.length - failed
    setError(isId
      ? `${succeeded} dari ${pending.length} file berhasil diunggah. Periksa file yang gagal di atas, lalu unggah ulang.`
      : `${succeeded} of ${pending.length} files uploaded. Check the failed files above, then upload again.`)
  }

  const handleClose = () => {
    if (uploading) return
    resetForm()
    onClose()
  }

  const pendingCount = items.filter((item) => item.state !== 'done').length
  const legalStatusOptions = LEGAL_STATUSES.map((status) => (
    <option key={status} value={status}>{legalStatusLabel(status, isId)}</option>
  ))

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className={`modal-card upload-modal ${isBatch ? 'is-batch' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isId ? 'Unggah dokumen' : 'Upload documents'}</h2>
          <button className="icon-button" onClick={handleClose} disabled={uploading}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div
            className={`upload-file-area ${items.length ? 'is-compact' : ''} ${dragging ? 'is-dragging' : ''}`}
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); if (!uploading) setDragging(true) }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}
          >
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" multiple onChange={handleFileChange} style={{ display: 'none' }} />
            {items.length ? (
              <div className="upload-file-more">
                <Plus size={16} />
                <span>{isId ? 'Tambah file lagi' : 'Add more files'}</span>
                <small>{items.length}/{MAX_FILES}</small>
              </div>
            ) : (
              <div className="upload-file-empty">
                <Upload size={24} />
                <p>{isId ? 'Klik atau seret file ke sini' : 'Click or drop files here'}</p>
                <small>{isId ? `PDF, DOCX, atau TXT, maks 10MB per file, hingga ${MAX_FILES} file sekaligus` : `PDF, DOCX, or TXT, max 10 MB each, up to ${MAX_FILES} files at once`}</small>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <ul className="upload-queue">
              {items.map((item) => {
                const locked = uploading || item.state === 'done'
                return (
                  <li key={item.key} className={`upload-queue-item is-${item.state}`}>
                    <div className="upload-file-selected">
                      <span className="upload-file-icon"><FileText size={18} /></span>
                      <div>
                        <strong title={item.file.name}>{item.file.name}</strong>
                        <small>{(item.file.size / 1024).toFixed(1)} KB</small>
                      </div>
                      {item.state === 'uploading' && <LoaderCircle size={16} className="spin upload-queue-state" />}
                      {item.state === 'done' && <CheckCircle2 size={16} className="upload-queue-state is-done" />}
                      {item.state === 'error' && <AlertCircle size={16} className="upload-queue-state is-error" />}
                      <button
                        className="icon-button"
                        aria-label={isId ? `Hapus ${item.file.name} dari daftar` : `Remove ${item.file.name} from the list`}
                        onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                        disabled={locked}
                      ><X size={14} /></button>
                    </div>

                    <div className="upload-queue-fields">
                      <input
                        aria-label={isId ? 'Judul dokumen (opsional)' : 'Document title (optional)'}
                        value={item.title}
                        onChange={(event) => updateItem(item.key, { title: event.target.value })}
                        placeholder={`${isId ? 'Judul' : 'Title'}: ${item.file.name.replace(/\.[^.]+$/, '')}`}
                        maxLength={200}
                        disabled={locked}
                      />
                      {isBatch && (
                        <div className="upload-queue-selects">
                          <div className="select-wrapper">
                            <select
                              aria-label={isId ? 'Kategori' : 'Category'}
                              value={item.categoryId}
                              onChange={(event) => updateItem(item.key, { categoryId: event.target.value })}
                              disabled={locked}
                            >
                              <option value="">{isId ? 'Tanpa kategori' : 'No category'}</option>
                              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                            </select>
                          </div>
                          {!isPersonal && (
                            <div className="select-wrapper">
                              <select
                                aria-label={isId ? 'Status keberlakuan' : 'Legal status'}
                                value={item.legalStatus}
                                onChange={(event) => updateItem(item.key, { legalStatus: event.target.value as ApiLegalStatus })}
                                disabled={locked}
                              >
                                {legalStatusOptions}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {item.state === 'error' && item.error && <p className="upload-queue-error">{item.error}</p>}
                  </li>
                )
              })}
            </ul>
          )}

          {isBatch && (
            <div className="upload-batch-heading">
              <strong>{isId ? 'Pengaturan untuk semua file' : 'Settings for all files'}</strong>
              <span>{isId ? 'Pilihan di bawah mengisi semua file sekaligus. Ubah per file di atas bila ada yang berbeda.' : 'Choices below fill in every file at once. Adjust single files above when one differs.'}</span>
            </div>
          )}

          {!isPersonal && <div className="upload-field">
            <label htmlFor="upload-legal-status"><Scale size={13} style={{ marginRight: 4, verticalAlign: -1 }} />{isId ? 'Status keberlakuan' : 'Legal status'}</label>
            <div className="select-wrapper">
              <select
                id="upload-legal-status"
                value={sharedLegalStatus ?? ''}
                onChange={(event) => applyLegalStatusToAll(event.target.value as ApiLegalStatus)}
                disabled={uploading}
              >
                {sharedLegalStatus === null && <option value="" disabled>{isId ? '— Berbeda per file —' : '— Varies per file —'}</option>}
                {legalStatusOptions}
              </select>
            </div>
            {sharedLegalStatus && <p className="field-hint">{legalStatusHint(sharedLegalStatus, isId)}</p>}
            {items.some((item) => item.legalStatus === 'RANCANGAN') && sharedLegalStatus === null && (
              <p className="field-hint">{legalStatusHint('RANCANGAN', isId)}</p>
            )}
          </div>}

          <div className="upload-field">
            <label><FolderOpen size={13} style={{ marginRight: 4, verticalAlign: -1 }} />{isId ? 'Kategori' : 'Category'}</label>
            {(isSuperAdmin || isPersonal) && <div>
              {addingCategory ? <div className="upload-field"><input aria-label={isId ? 'Nama kategori baru' : 'New category name'} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} maxLength={80} disabled={categorySaving} /><button type="button" className="secondary-button" disabled={categorySaving || newCategory.trim().length < 2} onClick={saveCategory}><Plus size={15} />{isId ? 'Simpan kategori' : 'Save category'}</button></div>
                : <button type="button" className="link-button" onClick={() => setAddingCategory(true)}><Plus size={15} />{isId ? 'Tambah kategori' : 'Add category'}</button>}
            </div>}
            {categories.length === 0 ? (
              <p className="field-hint">
                {isId
                  ? 'Belum ada kategori yang tersedia untuk unit kerja Anda.'
                  : 'No category is available for your work unit.'}
              </p>
            ) : (
              <div className="upload-collection-grid">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`upload-collection-chip ${sharedCategoryId === category.id ? 'active' : ''}`}
                    onClick={() => applyCategoryToAll(sharedCategoryId === category.id ? '' : category.id)}
                    disabled={uploading}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}
            <p className="field-hint">
              {sharedCategoryId === null
                ? (isId ? 'Kategori berbeda per file. Memilih di sini akan menyamakan semuanya.' : 'Categories differ per file. Picking one here sets it for all of them.')
                : (isId
                    ? 'Kategori adalah penanda subjek untuk pencarian dan filter, bukan pembatas akses.'
                    : 'The category is a subject label for search and filtering, not an access boundary.')}
            </p>
          </div>

          {!isPersonal && <div className="upload-field">
            <label><Building2 size={13} style={{ marginRight: 4, verticalAlign: -1 }} />{isId ? 'Batasi ke unit kerja' : 'Restrict to work unit'}</label>
            <label className="upload-restrict-toggle">
              <input
                type="checkbox"
                checked={isSuperAdmin ? restrictToUnit : true}
                onChange={(event) => setRestrictToUnit(event.target.checked)}
                // Selain super admin, tidak ada yang bisa melepasnya — pemegang
                // izin unggah lewat jabatan selalu ditandai unitnya sendiri oleh
                // server, jadi centang yang bisa dilepas hanya akan berbohong
                // soal apa yang terjadi.
                disabled={uploading || !isSuperAdmin}
              />
              <span>
                {isSuperAdmin
                  ? (isId ? 'Hanya untuk satu unit kerja tertentu' : 'Only for one specific work unit')
                  : (isId
                      ? `Hanya untuk ${ownUnit?.name ?? 'unit kerja saya'}`
                      : `Only for ${ownUnit?.name ?? 'my work unit'}`)}
              </span>
            </label>

            {isSuperAdmin && restrictToUnit && (
              <div className="select-wrapper" style={{ marginTop: 8 }}>
                <select
                  value={unitKerjaId}
                  onChange={(event) => setUnitKerjaId(event.target.value)}
                  disabled={uploading}
                >
                  <option value="">{isId ? '— Pilih unit kerja —' : '— Select work unit —'}</option>
                  {unitKerjaList.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
              </div>
            )}

            <p className="field-hint">
              {isSuperAdmin
                ? (isId
                    ? `Tanpa centang, dokumen terbuka untuk semua pegawai — ini bawaannya. Centang hanya bila isinya memang khusus satu unit kerja.${isBatch ? ' Pilihan ini berlaku untuk semua file di daftar.' : ''} Bisa diubah kapan saja lewat tombol atur akses di daftar dokumen.`
                    : `Left unchecked, the document is open to every employee — that is the default. Check it only when the content really belongs to one work unit.${isBatch ? ' This applies to every file in the list.' : ''} You can change it later from the access button in the document list.`)
                : (isId
                    ? 'Dokumen yang Anda unggah selalu ditandai untuk unit kerja Anda. Hanya super admin yang dapat membukanya untuk seluruh pegawai.'
                    : 'Documents you upload are always tagged for your work unit. Only a super admin can open them to every employee.')}
            </p>
          </div>}

          {error && <div className="upload-error-msg" role="alert" ref={errorRef}>{error}</div>}
        </div>

        <div className="modal-actions">
          <button className="secondary-button" onClick={handleClose} disabled={uploading}>{isId ? 'Batal' : 'Cancel'}</button>
          <button
            className="primary-button"
            onClick={handleUpload}
            disabled={!pendingCount || uploading || (isSuperAdmin && restrictToUnit && !unitKerjaId)}
          >
            {uploading
              ? <><LoaderCircle size={15} className="spin" /> {isId ? 'Mengunggah' : 'Uploading'} {progress.total > 1 ? `${progress.current}/${progress.total}` : ''}…</>
              : <><Upload size={15} /> {pendingCount > 1 ? (isId ? `Unggah ${pendingCount} file` : `Upload ${pendingCount} files`) : (isId ? 'Unggah' : 'Upload')}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
