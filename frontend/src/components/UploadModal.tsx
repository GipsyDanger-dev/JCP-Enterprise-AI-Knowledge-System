import { useRef, useState } from 'react'
import { FileText, FolderOpen, LoaderCircle, Upload, X } from 'lucide-react'
import { uploadDocument } from '@/api/documents'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'

const COLLECTIONS = ['Operations', 'IT & Security', 'Finance', 'People']

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUploaded: () => void
}

export function UploadModal({ open, onClose, onUploaded }: UploadModalProps) {
  const { token } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [collection, setCollection] = useState(COLLECTIONS[0])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await uploadDocument(file, token ?? undefined, collection)
      setFile(null)
      onUploaded()
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
    setError(null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Upload document</h2>
          <button className="icon-button" onClick={handleClose} disabled={uploading}><X size={18} /></button>
        </div>

        {/* File picker */}
        <div className="upload-file-area" onClick={() => !uploading && fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={handleFileChange} style={{ display: 'none' }} />
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
              <p>Click to select file</p>
              <small>PDF or DOCX, max 50MB</small>
            </div>
          )}
        </div>

        {/* Collection picker */}
        <div className="upload-field">
          <label>Collection</label>
          <div className="upload-collection-grid">
            {COLLECTIONS.map((c) => (
              <button
                key={c}
                className={`upload-collection-btn ${collection === c ? 'active' : ''}`}
                onClick={() => setCollection(c)}
                disabled={uploading}
              >
                <FolderOpen size={14} /> {c}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="upload-error-msg">{error}</div>}

        {/* Actions */}
        <div className="modal-actions">
          <button className="secondary-button" onClick={handleClose} disabled={uploading}>Cancel</button>
          <button className="primary-button" onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? <><LoaderCircle size={15} className="spin" /> Uploading…</> : <><Upload size={15} /> Upload</>}
          </button>
        </div>
      </div>
    </div>
  )
}
