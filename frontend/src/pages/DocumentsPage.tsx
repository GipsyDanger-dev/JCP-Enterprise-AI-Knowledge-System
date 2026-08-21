import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, Download, FileText, FolderOpen, Search, ShieldAlert, Trash2, Upload, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { StatusBadge } from '@/components/StatusBadge'
import { UploadModal } from '@/components/UploadModal'
import { downloadDocument, getDocumentChunks, type DocumentChunk } from '@/api/documents'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import type { DocumentItem } from '@/types/domain'

const COLLECTIONS = ['All', 'Operations', 'IT & Security', 'Finance', 'People']

function DocViewer({ doc, isId, canManage, token, onClose, onDelete, onChunksLoaded, chunks, chunksLoading, setChunksLoading }: {
  doc: DocumentItem
  isId: boolean
  canManage: boolean
  token: string | null
  onClose: () => void
  onDelete: (id: string, name: string) => void
  onChunksLoaded: (chunks: DocumentChunk[]) => void
  chunks: DocumentChunk[]
  chunksLoading: boolean
  setChunksLoading: (v: boolean) => void
}) {
  useEffect(() => {
    if (doc.status !== 'Ready' || chunks.length > 0) return
    setChunksLoading(true)
    getDocumentChunks(doc.id, token ?? undefined)
      .then((res) => onChunksLoaded(res.chunks))
      .catch(() => onChunksLoaded([]))
      .finally(() => setChunksLoading(false))
  }, [chunks.length, doc.id, doc.status, onChunksLoaded, setChunksLoading, token])

  // Group chunks by page
  const pages = useMemo(() => {
    const map = new Map<number, DocumentChunk[]>()
    chunks.forEach((c) => {
      const p = c.pageNumber ?? 0
      if (!map.has(p)) map.set(p, [])
      map.get(p)!.push(c)
    })
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [chunks])

  return (
    <div className="doc-viewer-overlay" onClick={onClose}>
      <div className="doc-viewer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="doc-viewer-header">
          <div className="doc-viewer-title">
            <FileText size={20} />
            <div>
              <h2>{doc.name}</h2>
              <span className="doc-viewer-meta">
                <StatusBadge status={doc.status} />
                <span>{doc.collection}</span>
                <span>{doc.updatedAt}</span>
              </span>
            </div>
          </div>
          <div className="doc-viewer-actions">
            {doc.status === 'Ready' && (
              <button className="secondary-button" onClick={() => downloadDocument(doc.id, doc.name, token ?? undefined)}>
                <Download size={15} /> {isId ? 'Unduh' : 'Download'}
              </button>
            )}
            {canManage && (
              <button className="danger-button" onClick={() => { onDelete(doc.id, doc.name); onClose() }}>
                <Trash2 size={15} /> {isId ? 'Hapus' : 'Delete'}
              </button>
            )}
            <button className="icon-button" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {/* Content */}
        <div className="doc-viewer-content">
          {doc.status !== 'Ready' && (
            <div className="doc-viewer-status">
              <p>{doc.status === 'Processing' ? (isId ? 'Dokumen sedang diproses...' : 'Document is being processed...')
                : doc.status === 'Queued' ? (isId ? 'Menunggu diproses...' : 'Waiting to be processed...')
                : (isId ? 'Dokumen gagal diproses.' : 'Document failed to process.')}</p>
            </div>
          )}
          {doc.status === 'Ready' && chunksLoading && (
            <div className="doc-viewer-loading">
              <p>{isId ? 'Memuat pratinjau...' : 'Loading preview...'}</p>
            </div>
          )}
          {doc.status === 'Ready' && !chunksLoading && chunks.length === 0 && (
            <div className="doc-viewer-empty">
              <p>{isId ? 'Tidak ada pratinjau tersedia.' : 'No preview available.'}</p>
            </div>
          )}
          {doc.status === 'Ready' && !chunksLoading && pages.length > 0 && (
            <div className="doc-viewer-pages">
              {pages.map(([pageNum, pageChunks]) => (
                <div key={pageNum} className="doc-viewer-page">
                  <div className="doc-viewer-page-label">
                    {isId ? `Halaman ${pageNum}` : `Page ${pageNum}`}
                  </div>
                  {pageChunks.map((chunk) => (
                    <div key={chunk.chunkId} className="doc-viewer-chunk">
                      {chunk.sectionTitle && (
                        <div className="doc-viewer-chunk-title">{chunk.sectionTitle}</div>
                      )}
                      <p>{chunk.text}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function DocumentsPage() {
  const { token } = useAuth()
  const { documents, role, uploadError, removeDocument, registerUploadedDocument, language } = useWorkspace()
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
  const [docChunks, setDocChunks] = useState<DocumentChunk[]>([])
  const [chunksLoading, setChunksLoading] = useState(false)

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

  const handleDelete = async (id: string, name: string) => {
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
              <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button className="icon-button" title={isId ? `Unduh ${document.name}` : `Download ${document.name}`} onClick={(e) => { e.stopPropagation(); downloadDocument(document.id, document.name, token ?? undefined) }}><Download size={15} /></button>
                {canManage
                  ? <button className="icon-button danger" title={`Delete ${document.name}`} onClick={(e) => { e.stopPropagation(); handleDelete(document.id, document.name) }}><Trash2 size={16} /></button>
                  : <button className="icon-button" title={`Open ${document.name}`} onClick={(e) => { e.stopPropagation(); setSelectedDoc(document) }}><ArrowUpRight size={16} /></button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* Document detail — full-screen viewer */}
      {selectedDoc && (
        <DocViewer doc={selectedDoc} isId={isId} canManage={canManage} token={token} onClose={() => { setSelectedDoc(null); setDocChunks([]) }} onDelete={handleDelete} onChunksLoaded={setDocChunks} chunks={docChunks} chunksLoading={chunksLoading} setChunksLoading={setChunksLoading} />
      )}

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={registerUploadedDocument} />
    </div>
  )
}
