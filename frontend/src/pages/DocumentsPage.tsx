import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, Download, FileText, FolderOpen, Search, ShieldAlert, Trash2, Upload, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { StatusBadge } from '@/components/StatusBadge'
import { UploadModal } from '@/components/UploadModal'
import { useWorkspace } from '@/hooks/useWorkspace'
import type { DocumentItem } from '@/types/domain'

const COLLECTIONS = ['All', 'Operations', 'IT & Security', 'Finance', 'People']

export function DocumentsPage() {
  const { documents, role, uploadError, removeDocument, language } = useWorkspace()
  const canManage = role === 'admin'
  const isId = language === 'id'
  const [searchParams, setSearchParams] = useSearchParams()
  const initialCollection = searchParams.get('collection') ?? 'All'
  const initialQuery = searchParams.get('q') ?? ''
  const [query, setQuery] = useState(initialQuery)
  const [collection, setCollection] = useState(initialCollection)
  const [showCollections, setShowCollections] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      const matchesQuery = doc.name.toLowerCase().includes(query.toLowerCase())
      const matchesCollection = collection === 'All' || doc.collection === collection
      return matchesQuery && matchesCollection
    })
  }, [documents, query, collection])

  const handleCollectionChange = (c: string) => {
    setCollection(c)
    setShowCollections(false)
    if (c === 'All') {
      searchParams.delete('collection')
    } else {
      searchParams.set('collection', c)
    }
    setSearchParams(searchParams)
  }

  const handleDelete = async (id: number, name: string) => {
    if (window.confirm(`Hapus dokumen "${name}"?`)) {
      await removeDocument(id)
      if (selectedDoc?.id === id) setSelectedDoc(null)
    }
  }

  const action = canManage ? (
    <button className="primary-button" onClick={() => setShowUpload(true)}>
      <Upload size={17} /> {isId ? 'Unggah dokumen' : 'Upload document'}
    </button>
  ) : undefined

  return (
    <div className="standard-page">
      <PageHeading eyebrow={isId ? 'Basis pengetahuan' : 'Knowledge base'} title={canManage ? (isId ? 'Dokumen' : 'Documents') : (isId ? 'Perpustakaan pengetahuan' : 'Knowledge library')} detail={canManage ? `${documents.length} ${isId ? 'sumber terhubung ke ruang kerja ini.' : 'sources connected to this workspace.'}` : `${documents.length} ${isId ? 'sumber terpercaya tersedia untuk Anda.' : 'trusted sources available to you.'}`} action={action} />
      {uploadError && <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {uploadError}</div>}
      <div className="table-toolbar">
        <div className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isId ? 'Cari dokumen' : 'Search documents'} /></div>
        <div className="collection-dropdown-wrap">
          <button className="secondary-button" onClick={() => setShowCollections(!showCollections)}>
            <FolderOpen size={16} /> {collection} <ChevronDown size={14} />
          </button>
          {showCollections && (
            <div className="collection-dropdown">
              {COLLECTIONS.map((c) => (
                <button key={c} className={collection === c ? 'active' : ''} onClick={() => handleCollectionChange(c)}>
                  {c === 'All' ? (isId ? 'Semua koleksi' : 'All collections') : c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="data-table">
        <table>
          <thead><tr><th>{isId ? 'Dokumen' : 'Document'}</th><th>{isId ? 'Koleksi' : 'Collection'}</th><th>{isId ? 'Diperbarui' : 'Updated'}</th><th>Status</th><th>Chunks</th><th aria-label={isId ? 'Aksi' : 'Actions'} /></tr></thead>
          <tbody>{filtered.length === 0 ? (
            <tr><td colSpan={6} className="empty-row">Tidak ada dokumen ditemukan.</td></tr>
          ) : filtered.map((document) => (
            <tr key={document.id} className="clickable-row" onClick={() => setSelectedDoc(document)}>
              <td><div className="document-name"><span><FileText size={18} /></span><strong>{document.name}</strong></div></td>
              <td>{document.collection}</td>
              <td>{document.updatedAt}</td>
              <td><StatusBadge status={document.status} /></td>
              <td>{document.chunks ?? '—'}</td>
              <td>{canManage
                ? <button className="icon-button danger" title={`Delete ${document.name}`} onClick={(e) => { e.stopPropagation(); handleDelete(document.id, document.name) }}><Trash2 size={16} /></button>
                : <button className="icon-button" title={`Open ${document.name}`} onClick={(e) => { e.stopPropagation(); setSelectedDoc(document) }}><ArrowUpRight size={16} /></button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* Document detail modal */}
      {selectedDoc && (
        <div className="modal-overlay" onClick={() => setSelectedDoc(null)}>
          <div className="modal-card doc-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="doc-detail-header">
                <span className="doc-detail-icon"><FileText size={24} /></span>
                <div>
                  <h2>{selectedDoc.name}</h2>
                  <small>{selectedDoc.collection}</small>
                </div>
              </div>
              <button className="icon-button" onClick={() => setSelectedDoc(null)}><X size={18} /></button>
            </div>

            <div className="doc-detail-grid">
              <div className="doc-detail-field">
                <label>{isId ? 'Status' : 'Status'}</label>
                <StatusBadge status={selectedDoc.status} />
              </div>
              <div className="doc-detail-field">
                <label>{isId ? 'Koleksi' : 'Collection'}</label>
                <span>{selectedDoc.collection}</span>
              </div>
              <div className="doc-detail-field">
                <label>{isId ? 'Diperbarui' : 'Updated'}</label>
                <span>{selectedDoc.updatedAt}</span>
              </div>
              <div className="doc-detail-field">
                <label>{isId ? 'Chunk terindeks' : 'Indexed chunks'}</label>
                <span>{selectedDoc.chunks ?? '—'}</span>
              </div>
            </div>

            <div className="doc-detail-info">
              <p>Document ini sudah ter-index dan tersedia untuk AI search. {selectedDoc.status === 'Ready' ? 'Status: siap digunakan.' : selectedDoc.status === 'Processing' ? 'Sedang diproses oleh pipeline indexing.' : selectedDoc.status === 'Queued' ? 'Menunggu giliran diproses.' : 'Gagal diproses.'}</p>
            </div>

            {selectedDoc.status === 'Ready' && (
              <div className="doc-preview-content">
                <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 8, display: 'block' }}>{isId ? 'Pratinjau dokumen' : 'Document preview'}</label>
                <div className="doc-preview-chunks">
                  <div className="doc-preview-chunk">
                    <label>Section 1 · Page 1</label>
                    <p>This document contains standard operating procedures for business travel. All employees must follow the guidelines outlined below when requesting travel approvals.</p>
                  </div>
                  <div className="doc-preview-chunk">
                    <label>Section 2 · Page 3</label>
                    <p>Hotel allowances are determined by employee grade level. Managers are entitled to up to Rp 1,500,000 per night, while staff members receive up to Rp 800,000 per night.</p>
                  </div>
                  <div className="doc-preview-chunk">
                    <label>Section 3 · Page 5</label>
                    <p>Transportation costs are reimbursed based on actual expenses with a maximum limit per destination. Receipts must be submitted within 7 business days.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="doc-detail-actions">
              {selectedDoc.status === 'Ready' && (
                <button className="secondary-button" onClick={() => window.alert('Download dimulai. Dalam produksi, file akan diunduh dari backend.')}
                >
                  <Download size={15} /> {isId ? 'Unduh dokumen' : 'Download document'}
                </button>
              )}
              {canManage && (
                <button className="danger-button" onClick={() => { handleDelete(selectedDoc.id, selectedDoc.name) }}>
                  <Trash2 size={15} /> Hapus dokumen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={() => {}} />
    </div>
  )
}
