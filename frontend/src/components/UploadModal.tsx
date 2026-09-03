import { useEffect, useRef, useState } from 'react'
import { Building2, FileText, FolderOpen, LoaderCircle, Upload, X } from 'lucide-react'
import { listDocumentCategories, uploadDocument } from '@/api/documents'
import { getUserReferenceData } from '@/api/users'
import { errorMessage } from '@/api/client'
import type { ApiDocument, ApiDocumentCategory, ApiUnitKerja } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

const MAX_FILE_SIZE = 10 * 1024 * 1024

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUploaded: (document: ApiDocument) => void
}

export function UploadModal({ open, onClose, onUploaded }: UploadModalProps) {
  const { token, user } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const fileRef = useRef<HTMLInputElement>(null)

  // Kategori dibaca dari server dan sudah tersaring untuk pengguna ini, jadi
  // tidak mungkin mengunggah ke kategori yang unit kerjanya sendiri tak berhak.
  const [categories, setCategories] = useState<ApiDocumentCategory[]>([])
  const [unitKerjaList, setUnitKerjaList] = useState<ApiUnitKerja[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  // Bawaannya dibatasi ke unit kerja sendiri: lebih aman salah terlalu sempit
  // daripada dokumen internal ikut terbaca unit lain karena lupa mencentang.
  const [restrictToUnit, setRestrictToUnit] = useState(true)
  const [unitKerjaId, setUnitKerjaId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSuperAdmin = user?.isAdmin ?? false
  const ownUnit = user?.unitKerja ?? null

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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return

    const extension = selected.name.split('.').pop()?.toLowerCase()
    const allowed = ['pdf', 'docx', 'txt', 'md']
    if (!extension || !allowed.includes(extension)) {
      setFile(null)
      setError(isId ? 'Hanya file PDF, DOCX, TXT, dan MD yang didukung.' : 'Only PDF, DOCX, TXT, and MD files are supported.')
      return
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFile(null)
      setError('File size must not exceed 10 MB.')
      return
    }
    setFile(selected)
    setError(null)
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const document = await uploadDocument(file, token ?? undefined, {
        title,
        categoryId: categoryId || undefined,
        // Admin unit tidak mengirim id apa pun: server yang mengisikan unit
        // kerjanya sendiri, sehingga nilai dari klien tidak bisa dipakai
        // menandai dokumen atas nama unit lain.
        unitKerjaId: isSuperAdmin
          ? (restrictToUnit ? unitKerjaId || undefined : undefined)
          : (restrictToUnit ? ownUnit?.id : undefined),
      })
      setFile(null)
      setTitle('')
      setCategoryId('')
      onUploaded(document)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    if (uploading) return
    setFile(null)
    setTitle('')
    setCategoryId('')
    setRestrictToUnit(true)
    setUnitKerjaId('')
    setError(null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isId ? 'Unggah dokumen' : 'Upload document'}</h2>
          <button className="icon-button" onClick={handleClose} disabled={uploading}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="upload-file-area" onClick={() => !uploading && fileRef.current?.click()}>              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={handleFileChange} style={{ display: 'none' }} />
          {file ? (
            <div className="upload-file-selected">
              <span className="upload-file-icon"><FileText size={20} /></span>
              <div>
                <strong>{file.name}</strong>
                <small>{(file.size / 1024).toFixed(1)} KB</small>
              </div>
              <button className="icon-button" onClick={(e) => { e.stopPropagation(); setFile(null) }}><X size={14} /></button>
            </div>
          ) : (
            <div className="upload-file-empty">
              <Upload size={24} />
              <p>{isId ? 'Klik untuk memilih file' : 'Click to select file'}</p>
              <small>{isId ? 'PDF, DOCX, TXT, atau MD, maks 10MB' : 'PDF, DOCX, TXT, or MD, max 10 MB'}</small>
            </div>
          )}
        </div>

        <div className="upload-field">
          <label>{isId ? 'Judul dokumen' : 'Document title'} ({isId ? 'opsional' : 'optional'})</label>
          <input
            id="upload-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={file ? file.name.replace(/\.[^.]+$/, '') : (isId ? 'Masukkan judul dokumen' : 'Enter a document title')}
            disabled={uploading}
          />
        </div>

        <div className="upload-field">
          <label><FolderOpen size={13} style={{ marginRight: 4, verticalAlign: -1 }} />{isId ? 'Kategori' : 'Category'}</label>
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
                  className={`upload-collection-chip ${categoryId === category.id ? 'active' : ''}`}
                  onClick={() => setCategoryId(categoryId === category.id ? '' : category.id)}
                  disabled={uploading}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}
          <p className="field-hint">
            {isId
              ? 'Kategori menentukan unit kerja mana yang boleh membaca dokumen ini.'
              : 'The category decides which work units may read this document.'}
          </p>
        </div>

        <div className="upload-field">
          <label><Building2 size={13} style={{ marginRight: 4, verticalAlign: -1 }} />{isId ? 'Batasi ke unit kerja' : 'Restrict to work unit'}</label>
          <label className="upload-restrict-toggle">
            <input
              type="checkbox"
              checked={restrictToUnit}
              onChange={(event) => setRestrictToUnit(event.target.checked)}
              disabled={uploading}
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
            {isId
              ? 'Pembatasan ini hanya mempersempit akses dari kategori, tidak pernah memperluasnya. Lepaskan centang bila dokumen boleh dibaca semua unit yang berhak atas kategorinya.'
              : 'This only narrows the access granted by the category, never widens it. Uncheck it when every unit entitled to the category may read the document.'}
          </p>
        </div>

        {error && <div className="upload-error-msg">{error}</div>}
        </div>

        <div className="modal-actions">
          <button className="secondary-button" onClick={handleClose} disabled={uploading}>{isId ? 'Batal' : 'Cancel'}</button>
          <button className="primary-button" onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? <><LoaderCircle size={15} className="spin" /> {isId ? 'Mengunggah…' : 'Uploading…'}</> : <><Upload size={15} /> {isId ? 'Unggah' : 'Upload'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
