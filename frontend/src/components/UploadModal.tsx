import { useRef, useState } from 'react'
import { FileText, LoaderCircle, Upload, X } from 'lucide-react'
import { uploadDocument } from '@/api/documents'
import { errorMessage } from '@/api/client'
import type { ApiDocument } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'

const MAX_FILE_SIZE = 10 * 1024 * 1024

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUploaded: (document: ApiDocument) => void
}

export function UploadModal({ open, onClose, onUploaded }: UploadModalProps) {
  const { token } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return

    const extension = selected.name.split('.').pop()?.toLowerCase()
    if (extension !== 'pdf' && extension !== 'docx') {
      setFile(null)
      setError('Only PDF and DOCX files are supported.')
      return
    }
    if (selected.size === 0) {
      setFile(null)
      setError('The selected file is empty.')
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
              <small>PDF or DOCX, max 10 MB</small>
            </div>
          )}
        </div>

        <div className="upload-field">
          <label htmlFor="upload-title">Document title (optional)</label>
          <input
            id="upload-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            placeholder={file ? file.name.replace(/\.[^.]+$/, '') : 'Enter a document title'}
            disabled={uploading}
          />
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
