import { useRef, useState } from 'react'
import { ChevronDown, FileText, FolderOpen, LoaderCircle, Upload, X } from 'lucide-react'
import { uploadDocument } from '@/api/documents'
import { errorMessage } from '@/api/client'
import type { ApiDocument } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

const MAX_FILE_SIZE = 10 * 1024 * 1024

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUploaded: (document: ApiDocument) => void
}

export function UploadModal({ open, onClose, onUploaded }: UploadModalProps) {
  const { token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const fileRef = useRef<HTMLInputElement>(null)
  const COLLECTIONS = [
    { id: 'operations', label: 'Operations', icon: '📋' },
    { id: 'it-security', label: 'IT & Security', icon: '🔒' },
    { id: 'finance', label: 'Finance', icon: '💰' },
    { id: 'people', label: 'People', icon: '👥' },
    { id: 'legal', label: 'Legal', icon: '⚖️' },
    { id: 'marketing', label: 'Marketing', icon: '📢' },
  ]
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [collection, setCollection] = useState('operations')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const document = await uploadDocument(file, token ?? undefined, title)
      setFile(null)
      setTitle('')
      setCollection('operations')
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
    setCollection('operations')
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

        {/* File picker */}
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
            {COLLECTIONS.map((col) => (
              <button
                key={col.id}
                type="button"
                className={`upload-collection-chip ${collection === col.id ? 'active' : ''}`}
                onClick={() => setCollection(col.id)}
                disabled={uploading}
              >
                <span>{col.icon}</span> {col.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="upload-error-msg">{error}</div>}

        {/* Actions */}
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
