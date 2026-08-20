import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, Loader2, RefreshCw, Search, ShieldAlert, Trash2, Upload, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { StatusBadge } from '@/components/StatusBadge'
import { UploadModal } from '@/components/UploadModal'
import { useWorkspace } from '@/hooks/useWorkspace'
import type { DocumentItem } from '@/types/domain'

export function DocumentsPage() {
  const {
    documents,
    documentsLoading,
    documentsError,
    reloadDocuments,
    role,
    uploadError,
    removeDocument,
    registerUploadedDocument,
  } = useWorkspace()
  const canManage = role === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return documents
    return documents.filter((document) => document.name.toLowerCase().includes(normalizedQuery))
  }, [documents, query])

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete document "${name}"?`)) return
    const deleted = await removeDocument(id)
    if (deleted && selectedDoc?.id === id) setSelectedDoc(null)
  }

  const handleQueryChange = (value: string) => {
    const nextParams = new URLSearchParams(searchParams)
    if (value) nextParams.set('q', value)
    else nextParams.delete('q')
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow="Knowledge base"
        title={canManage ? 'Documents' : 'Knowledge library'}
        detail={documentsLoading ? 'Loading document metadata...' : `${documents.length} document${documents.length === 1 ? '' : 's'} available.`}
        action={canManage ? <button className="primary-button" onClick={() => setShowUpload(true)}><Upload size={17} /> Upload document</button> : undefined}
      />
      {uploadError && <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {uploadError}</div>}
      <div className="table-toolbar">
        <div className="filter-search"><Search size={16} /><input value={query} onChange={(event) => handleQueryChange(event.target.value)} placeholder="Search documents" /></div>
      </div>

      {documentsLoading ? (
        <div className="users-loading"><Loader2 size={20} className="spin" /> Loading documents...</div>
      ) : documentsError ? (
        <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {documentsError}<button className="link-button" onClick={() => void reloadDocuments()}><RefreshCw size={14} /> Retry</button></div>
      ) : (
        <div className="data-table">
          <table>
            <thead><tr><th>Document</th><th>Updated</th><th>Status</th><th aria-label="Actions" /></tr></thead>
            <tbody>{filtered.length === 0 ? (
              <tr><td colSpan={4} className="empty-row">{documents.length === 0 ? 'No documents are available.' : 'No documents match your search.'}</td></tr>
            ) : filtered.map((document) => (
              <tr key={document.id} className="clickable-row" onClick={() => setSelectedDoc(document)}>
                <td><div className="document-name"><span><FileText size={18} /></span><strong>{document.name}</strong></div></td>
                <td>{document.updatedAt || 'Unavailable'}</td>
                <td><StatusBadge status={document.status} /></td>
                <td>{canManage && <button className="icon-button danger" title={`Delete ${document.name}`} onClick={(event) => { event.stopPropagation(); void handleDelete(document.id, document.name) }}><Trash2 size={16} /></button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {selectedDoc && (
        <div className="modal-overlay" onClick={() => setSelectedDoc(null)}>
          <div className="modal-card doc-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="doc-detail-header"><span className="doc-detail-icon"><FileText size={24} /></span><div><h2>{selectedDoc.name}</h2></div></div>
              <button className="icon-button" onClick={() => setSelectedDoc(null)}><X size={18} /></button>
            </div>
            <div className="doc-detail-grid">
              <div className="doc-detail-field"><label>Status</label><StatusBadge status={selectedDoc.status} /></div>
              <div className="doc-detail-field"><label>Updated</label><span>{selectedDoc.updatedAt || 'Unavailable'}</span></div>
            </div>
            {canManage && (
              <div className="doc-detail-actions">
                <button className="danger-button" onClick={() => void handleDelete(selectedDoc.id, selectedDoc.name)}><Trash2 size={15} /> Delete document</button>
              </div>
            )}
          </div>
        </div>
      )}

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={registerUploadedDocument} />
    </div>
  )
}
