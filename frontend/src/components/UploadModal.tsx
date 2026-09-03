import { useEffect, useRef, useState } from 'react'
import { Check, FileText, FolderOpen, LoaderCircle, Plus, Upload, X } from 'lucide-react'
import { uploadDocument } from '@/api/documents'
import { createDocumentCategory, listDocumentCategories } from '@/api/documentCategories'
import { errorMessage } from '@/api/client'
import type { ApiDocument, ApiDocumentCategory } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

const MAX_FILE_SIZE = 10 * 1024 * 1024

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUploaded: (document: ApiDocument) => void
  onCategoryCreated?: (category: ApiDocumentCategory) => void
}

export function UploadModal({ open, onClose, onUploaded, onCategoryCreated }: UploadModalProps) {
  const { token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [collection, setCollection] = useState('')
  const [division, setDivision] = useState('')
  const [categories, setCategories] = useState<ApiDocumentCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !token) return
    let active = true
    setCategoriesLoading(true)
    listDocumentCategories(token)
      .then((items) => {
        if (!active) return
        setCategories(items)
        setCollection((current) => items.some((item) => item.name === current) ? current : (items[0]?.name ?? ''))
      })
      .catch((err) => { if (active) setError(errorMessage(err)) })
      .finally(() => { if (active) setCategoriesLoading(false) })
    return () => { active = false }
  }, [open, token])

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
    if (!file || !collection) return
    setUploading(true)
    setError(null)
    try {
      const document = await uploadDocument(file, token ?? undefined, title, collection, division)
      setFile(null)
      setTitle('')
      setCollection(categories[0]?.name ?? '')
      setDivision('')
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
    setCollection(categories[0]?.name ?? '')
    setDivision('')
    setShowCategoryForm(false)
    setNewCategoryName('')
    setError(null)
    onClose()
  }

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    setCreatingCategory(true)
    setError(null)
    try {
      const category = await createDocumentCategory(name, token ?? undefined)
      setCategories((items) => [...items, category].sort((a, b) => a.name.localeCompare(b.name)))
      setCollection(category.name)
      setNewCategoryName('')
      setShowCategoryForm(false)
      onCategoryCreated?.(category)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreatingCategory(false)
    }
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
          <label><FolderOpen size={13} style={{ marginRight: 4, verticalAlign: -1 }} />{isId ? 'Koleksi' : 'Collection'}</label>
          <div className="upload-collection-grid">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`upload-collection-chip ${collection === category.name ? 'active' : ''}`}
                onClick={() => setCollection(category.name)}
                disabled={uploading}
              >
                {collection === category.name && <Check size={13} />}
                {category.name}
              </button>
            ))}
            <button type="button" className="upload-collection-add" onClick={() => setShowCategoryForm((shown) => !shown)} disabled={uploading || categoriesLoading}><Plus size={14} /> {isId ? 'Tambah kategori' : 'Add category'}</button>
          </div>
          {categoriesLoading && <small className="upload-category-help">{isId ? 'Memuat kategori...' : 'Loading categories...'}</small>}
          {!categoriesLoading && categories.length === 0 && <small className="upload-category-help">{isId ? 'Belum ada kategori. Tambahkan kategori pertama.' : 'No categories yet. Add the first category.'}</small>}
          {showCategoryForm && <div className="upload-category-create">
            <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} maxLength={100} placeholder={isId ? 'Nama kategori baru' : 'New category name'} disabled={creatingCategory || uploading} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleCreateCategory() } }} />
            <button type="button" className="secondary-button" onClick={() => { setShowCategoryForm(false); setNewCategoryName('') }} disabled={creatingCategory}>{isId ? 'Batal' : 'Cancel'}</button>
            <button type="button" className="primary-button" onClick={handleCreateCategory} disabled={creatingCategory || newCategoryName.trim().length < 2}>{creatingCategory ? (isId ? 'Menyimpan...' : 'Saving...') : (isId ? 'Simpan' : 'Save')}</button>
          </div>}
        </div>        <div className="upload-field">
          <label>{isId ? 'Batasi ke divisi (opsional)' : 'Restrict to division (optional)'}</label>
          <input
            id="upload-division"
            value={division}
            onChange={(event) => setDivision(event.target.value)}
            placeholder={isId ? 'Kosongkan agar terlihat semua karyawan' : 'Leave empty so all employees can see it'}
            disabled={uploading}
            maxLength={100}
          />
          <small className="upload-category-help">{isId ? 'Hanya karyawan di divisi ini yang dapat melihat dokumen.' : 'Only employees in this division will be able to see the document.'}</small>
        </div>

        {error && <div className="upload-error-msg">{error}</div>}
        </div>

        <div className="modal-actions">
          <button className="secondary-button" onClick={handleClose} disabled={uploading}>{isId ? 'Batal' : 'Cancel'}</button>
          <button className="primary-button" onClick={handleUpload} disabled={!file || !collection || uploading}>
            {uploading ? <><LoaderCircle size={15} className="spin" /> {isId ? 'Mengunggah…' : 'Uploading…'}</> : <><Upload size={15} /> {isId ? 'Unggah' : 'Upload'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
