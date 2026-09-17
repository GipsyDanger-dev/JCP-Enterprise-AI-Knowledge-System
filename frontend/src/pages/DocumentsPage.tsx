import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Building2, ChevronDown, Download, FileText, FolderLock, FolderOpen, Pencil, Search, ShieldAlert, Trash2, Upload, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { StatusBadge } from '@/components/StatusBadge'
import { DataTable } from '@/components/DataTable'
import { UploadModal } from '@/components/UploadModal'
import { DocumentAccessModal } from '@/components/DocumentAccessModal'
import { downloadDocument, getDocumentBlob, getDocumentChunks, listDocumentCategories, updateDocument, updateDocumentAccess, type DocumentChunk } from '@/api/documents'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useScrollToError } from '@/hooks/useScrollToError'
import type { DocumentItem } from '@/types/domain'
import type { ApiDocumentCategory } from '@/api/types'
import { getUserReferenceData } from '@/api/users'
import type { ApiUnitKerja } from '@/api/types'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = `${pdfWorker}?v=2`

function PdfReader({ source, title, onError }: { source: string; title: string; onError: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    const task = pdfjsLib.getDocument({ url: source })
    task.promise.then(async (pdf) => {
      for (let number = 1; number <= pdf.numPages && !cancelled; number += 1) {
        const page = await pdf.getPage(number)
        const viewport = page.getViewport({ scale: 1.45 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.setAttribute('aria-label', `${title} page ${number}`)
        await page.render({ canvas, viewport }).promise
        if (!cancelled) containerRef.current?.appendChild(canvas)
      }
    }).catch(() => { if (!cancelled) onError() })
    return () => { cancelled = true; task.destroy() }
  }, [onError, source, title])
  return <div ref={containerRef} className="doc-reader-pdf-pages" />
}

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
  const extension = doc.filename.split('.').pop()?.toLowerCase()
  const canRenderOriginal = extension === 'pdf' || extension === 'docx' || extension === 'txt' || extension === 'md'
  const [readerUrl, setReaderUrl] = useState<string | null>(null)
  const [readerText, setReaderText] = useState<string | null>(null)
  const [readerLoading, setReaderLoading] = useState(false)
  const [readerError, setReaderError] = useState(false)
  const handlePdfRenderError = useCallback(() => setReaderError(true), [])
  useEffect(() => {
    if (doc.status !== 'Ready' || chunks.length > 0) return
    setChunksLoading(true)
    getDocumentChunks(doc.id, token ?? undefined)
      .then((res) => onChunksLoaded(res.chunks))
      .catch(() => onChunksLoaded([]))
      .finally(() => setChunksLoading(false))
  }, [chunks.length, doc.id, doc.status, onChunksLoaded, setChunksLoading, token])

  useEffect(() => {
    if (doc.status !== 'Ready' || !canRenderOriginal) return
    let cancelled = false
    let objectUrl: string | null = null
    setReaderLoading(true)
    setReaderError(false)
    setReaderText(null)
    setReaderUrl(null)

    getDocumentBlob(doc.id, token ?? undefined)
      .then(async (blob) => {
        if (extension === 'pdf') {
          objectUrl = URL.createObjectURL(blob)
          if (!cancelled) setReaderUrl(objectUrl)
          return
        }
        const text = extension === 'docx'
          ? (await (await import('mammoth')).extractRawText({ arrayBuffer: await blob.arrayBuffer() })).value
          : await blob.text()
        if (!cancelled) setReaderText(text.trim())
      })
      .catch(() => { if (!cancelled) setReaderError(true) })
      .finally(() => { if (!cancelled) setReaderLoading(false) })

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [canRenderOriginal, doc.id, doc.status, extension, token])

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

        <div className="doc-viewer-content">
          {doc.status !== 'Ready' && (
            <div className="doc-viewer-status">
              <p>{doc.status === 'Processing' ? (isId ? 'Dokumen sedang diproses...' : 'Document is being processed...')
                : doc.status === 'Queued' ? (isId ? 'Menunggu diproses...' : 'Waiting to be processed...')
                : (isId ? 'Dokumen gagal diproses.' : 'Document failed to process.')}</p>
            </div>
          )}
          {doc.status === 'Ready' && (chunksLoading || readerLoading) && (
            <div className="doc-viewer-loading">
              <p>{isId ? 'Memuat dokumen...' : 'Loading document...'}</p>
            </div>
          )}
          {doc.status === 'Ready' && !readerLoading && !readerError && readerUrl && <PdfReader source={readerUrl} title={doc.name} onError={handlePdfRenderError} />}
          {doc.status === 'Ready' && !readerLoading && readerText !== null && (
            <article className="doc-reader-paper" aria-label={doc.name}>
              {readerText ? readerText.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph.replace(/\n/g, ' ')}</p>
              )) : <p>{isId ? 'Dokumen ini tidak memiliki teks yang dapat dibaca.' : 'This document has no readable text.'}</p>}
            </article>
          )}
          {doc.status === 'Ready' && !readerLoading && readerError && (
            <div className="doc-viewer-empty">
              <p>{isId ? 'Pratinjau asli tidak dapat dimuat. Unduh dokumen untuk membukanya.' : 'The original preview could not be loaded. Download the document to open it.'}</p>
            </div>
          )}
          {doc.status === 'Ready' && !canRenderOriginal && !chunksLoading && chunks.length === 0 && (
            <div className="doc-viewer-empty">
              <p>{isId ? 'Pratinjau tidak tersedia untuk format ini. Unduh dokumen untuk membukanya.' : 'Preview is not available for this format. Download the document to open it.'}</p>
            </div>
          )}
          {doc.status === 'Ready' && !readerLoading && (readerError || !canRenderOriginal) && !chunksLoading && pages.length > 0 && (
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
  const { token, user } = useAuth()
  const { documents, role, uploadError, removeDocument, registerUploadedDocument, applyDocumentAccess, language } = useWorkspace()
  const isPersonal = user?.accountType === 'PERSONAL'
  const [renameDoc, setRenameDoc] = useState<DocumentItem | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameErrorRef = useScrollToError<HTMLDivElement>(renameError)
  const [deleteDoc, setDeleteDoc] = useState<{ id: string; name: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  /*
   * Cerminan dari canTargetUnit / canManageDocument / canUploadDocuments di
   * backend (documents/document-visibility.ts). Ditulis ulang di sini hanya
   * untuk memutuskan tombol mana yang muncul — penegakannya tetap di server.
   *
   * Sengaja ditiru semirip mungkin, bukan disederhanakan jadi satu boolean:
   * tombol yang muncul lalu berakhir 403 lebih membingungkan daripada tombol
   * yang memang tidak ada.
   */
  const ownUnitId = user?.unitKerja?.id ?? user?.unitKerjaId ?? null
  const isUnitAdmin = user?.role === 'ADMIN_UNIT'
  const jabatanBolehUnggah = user?.jabatan?.canUploadDocuments ?? false

  const bolehUntukUnit = (unitId: string | null) => {
    if (isPersonal) return !unitId
    if (role === 'admin') return true
    if (!ownUnitId) return false
    if (!isUnitAdmin && !jabatanBolehUnggah) return false
    return unitId === ownUnitId
  }

  const canUpload = isPersonal || role === 'admin' || ((isUnitAdmin || jabatanBolehUnggah) && Boolean(ownUnitId))

  /** Boleh mengubah nama, mengatur akses, atau menghapus dokumen ini. */
  const bolehUrus = (document: DocumentItem) => {
    if (!bolehUntukUnit(document.unitKerja?.id ?? null)) return false
    if (isPersonal || role === 'admin' || isUnitAdmin) return true
    return document.uploadedById === user?.id
  }

  // Panel massal mengunci dan membuka dokumen seluruh workspace — itu urusan
  // admin dan admin unit, bukan pemegang izin unggah lewat jabatan.
  const bolehKelolaMassal = role === 'admin' || isUnitAdmin
  const isId = language === 'id'
  const [searchParams, setSearchParams] = useSearchParams()
  const initialCollection = searchParams.get('collection') ?? 'All'
  const initialQuery = searchParams.get('q') ?? ''
  const requestedDocumentId = searchParams.get('doc')
  const [query, setQuery] = useState(initialQuery)
  const [collection, setCollection] = useState(initialCollection)
  // Kategori datang dari server dan sudah tersaring: hanya yang benar-benar
  // bisa diakses pengguna ini yang ikut terkirim.
  const [categories, setCategories] = useState<ApiDocumentCategory[]>([])
  const [showCollections, setShowCollections] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  // Daftar akses seluruh dokumen sekaligus, untuk mengunci beberapa dokumen
  // satu dinas dalam sekali jalan.
  const [showDocumentAccess, setShowDocumentAccess] = useState(false)
  const [docChunks, setDocChunks] = useState<DocumentChunk[]>([])
  const [chunksLoading, setChunksLoading] = useState(false)

  // Dialog atur akses. Hanya super admin yang melihatnya: mengunci dokumen ke
  // unit kerja adalah keputusan tingkat organisasi.
  const [accessDoc, setAccessDoc] = useState<DocumentItem | null>(null)
  const [accessCategoryId, setAccessCategoryId] = useState('')
  const [accessRestrict, setAccessRestrict] = useState(false)
  const [accessUnitId, setAccessUnitId] = useState('')
  const [accessSaving, setAccessSaving] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)
  const accessErrorRef = useScrollToError<HTMLDivElement>(accessError)
  const [unitKerjaList, setUnitKerjaList] = useState<ApiUnitKerja[]>([])

  useEffect(() => {
    if (!requestedDocumentId || selectedDoc) return
    const document = documents.find((item) => item.id === requestedDocumentId)
    if (document) setSelectedDoc(document)
  }, [documents, requestedDocumentId, selectedDoc])

  useEffect(() => {
    if (!accessDoc || !token || unitKerjaList.length > 0) return
    let batal = false
    getUserReferenceData(token)
      .then((data) => { if (!batal) setUnitKerjaList(data.unitKerja) })
      .catch(() => { if (!batal) setUnitKerjaList([]) })
    return () => { batal = true }
  }, [accessDoc, token, unitKerjaList.length])

  useEffect(() => {
    let batal = false
    listDocumentCategories(token ?? undefined)
      .then((data) => {
        if (batal) return
        setCategories(data)
        // Satu kategori berarti tidak ada yang bisa dipilih: langsung jadikan
        // lingkupnya, supaya judul filter menerangkan isi daftar apa adanya.
        if (data.length === 1) setCollection(data[0].name)
      })
      .catch(() => { if (!batal) setCategories([]) })
    return () => { batal = true }
  }, [token])

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      const matchesQuery = doc.name.toLowerCase().includes(query.toLowerCase())
      // Pembatasan siapa-boleh-lihat-apa sudah dilakukan backend. Di sini murni
      // penyaringan tampilan, jadi aturannya sama untuk admin maupun pegawai.
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

  const handleCloseDocument = () => {
    setSelectedDoc(null)
    setDocChunks([])
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('doc')
    setSearchParams(nextSearchParams)
  }

  const handleDelete = (id: string, name: string) => setDeleteDoc({ id, name })

  const confirmDelete = async () => {
    if (!deleteDoc || deleteBusy) return
    setDeleteBusy(true)
    try {
      await removeDocument(deleteDoc.id)
      if (selectedDoc?.id === deleteDoc.id) setSelectedDoc(null)
      setDeleteDoc(null)
    } finally { setDeleteBusy(false) }
  }
  const openAccessDialog = (document: DocumentItem) => {
    setAccessCategoryId(document.categoryId ?? '')
    setAccessRestrict(Boolean(document.unitKerja))
    setAccessUnitId(document.unitKerja?.id ?? '')
    setAccessError(null)
    setAccessDoc(document)
  }

  const saveAccess = async () => {
    if (!accessDoc || !token || accessSaving) return
    if (accessRestrict && !accessUnitId) {
      setAccessError(isId ? 'Pilih unit kerja yang boleh membaca dokumen ini.' : 'Choose the work unit allowed to read this document.')
      return
    }
    setAccessSaving(true)
    setAccessError(null)
    try {
      const updated = await updateDocumentAccess(accessDoc.id, {
        categoryId: accessCategoryId || null,
        // null berarti kuncinya dilepas: dokumen kembali terbuka untuk semua
        // pegawai. Dibedakan dari tidak mengirim field sama sekali.
        unitKerjaId: accessRestrict ? accessUnitId : null,
      }, token)
      applyDocumentAccess(updated)
      setAccessDoc(null)
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : (isId ? 'Perubahan akses gagal disimpan.' : 'Access change could not be saved.'))
    } finally {
      setAccessSaving(false)
    }
  }

  const action = canUpload ? (
    <>
      {!isPersonal && bolehKelolaMassal && <button className="secondary-button" onClick={() => setShowDocumentAccess(true)}>
        <FolderLock size={16} /> {isId ? 'Manajemen dokumen' : 'Document management'}
      </button>}
      <button className="primary-button" onClick={() => setShowUpload(true)}>
        <Upload size={17} /> {isId ? 'Unggah dokumen' : 'Upload document'}
      </button>
    </>
  ) : undefined

  return (
    <div className="standard-page">
      <PageHeading eyebrow={isId ? 'Basis pengetahuan' : 'Knowledge base'} title={canUpload ? (isId ? 'Dokumen' : 'Documents') : (isId ? 'Perpustakaan pengetahuan' : 'Knowledge library')} detail={canUpload ? `${documents.length} ${isId ? 'sumber terhubung ke ruang kerja ini.' : 'sources connected to this workspace.'}` : `${documents.length} ${isId ? 'sumber terpercaya tersedia untuk Anda.' : 'trusted sources available to you.'}`} action={action} />
      {uploadError && <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {uploadError}</div>}
      <div className="table-toolbar">
        <div className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isId ? 'Cari dokumen' : 'Search documents'} /></div>
        {/* Tanpa kategori yang bisa diakses, filternya tidak ditampilkan sama
            sekali. Dengan tepat satu kategori, pilihan "Semua" dibuang karena
            hasilnya akan persis sama dengan kategori itu sendiri. */}
        {categories.length > 0 && (
        <div className="collection-dropdown-wrap">
          <button className="secondary-button" onClick={() => setShowCollections(!showCollections)}>
            <FolderOpen size={16} />
            {collection === 'All' ? (isId ? 'Semua kategori' : 'All categories') : collection}
            {categories.length > 1 && <ChevronDown size={14} />}
          </button>
          {showCollections && categories.length > 1 && (
            <div className="collection-dropdown">
              <button className={collection === 'All' ? 'active' : ''} onClick={() => handleCollectionChange('All')}>
                {isId ? 'Semua kategori' : 'All categories'}
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={collection === category.name ? 'active' : ''}
                  onClick={() => handleCollectionChange(category.name)}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
      <DataTable>
        <table>
          <thead><tr><th>{isId ? 'Dokumen' : 'Document'}</th><th>{isId ? 'Koleksi' : 'Collection'}</th><th>{isId ? 'Diperbarui' : 'Updated'}</th><th>Status</th><th>Chunks</th><th aria-label={isId ? 'Aksi' : 'Actions'} /></tr></thead>
          <tbody>{filtered.length === 0 ? (
            <tr><td colSpan={6} className="empty-row">Tidak ada dokumen ditemukan.</td></tr>
          ) : filtered.map((document) => (
            <tr key={document.id} className="clickable-row" onClick={() => setSelectedDoc(document)}>
              <td><div className="document-name"><span><FileText size={18} /></span><strong>{document.name}</strong></div></td>
              <td>
                {document.collection}
                {document.unitKerja && (
                  <span className="doc-unit-chip" title={isId ? `Hanya untuk ${document.unitKerja.name}` : `Only for ${document.unitKerja.name}`}>
                    <Building2 size={11} /> {document.unitKerja.name}
                  </span>
                )}
              </td>
              <td>{document.updatedAt}</td>
              <td><StatusBadge status={document.status} /></td>
              <td>{document.chunks ?? '—'}</td>
              <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {bolehUrus(document) && <button className="icon-button" title={isId ? 'Ubah nama dokumen' : 'Rename document'} onClick={(event) => { event.stopPropagation(); setRenameDoc(document); setRenameTitle(document.name); setRenameError(null) }}><Pencil size={15} /></button>}
                <button className="icon-button" title={isId ? `Unduh ${document.name}` : `Download ${document.name}`} onClick={(e) => { e.stopPropagation(); downloadDocument(document.id, document.name, token ?? undefined) }}><Download size={15} /></button>
                {isPersonal ? <button className="icon-button danger" title={isId ? 'Hapus dokumen' : 'Delete document'} onClick={(e) => { e.stopPropagation(); handleDelete(document.id, document.name) }}><Trash2 size={16} /></button> : bolehUrus(document)
                  ? <><button className="icon-button" title={isId ? 'Atur akses dokumen' : 'Manage document access'} onClick={(e) => { e.stopPropagation(); openAccessDialog(document) }}><Building2 size={16} /></button><button className="icon-button danger" title={`Delete ${document.name}`} onClick={(e) => { e.stopPropagation(); handleDelete(document.id, document.name) }}><Trash2 size={16} /></button></>
                  : <><button className="icon-button" title={`Open ${document.name}`} onClick={(e) => { e.stopPropagation(); setSelectedDoc(document) }}><ArrowUpRight size={16} /></button></>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </DataTable>

      {selectedDoc && (
        <DocViewer doc={selectedDoc} isId={isId} canManage={bolehUrus(selectedDoc)} token={token} onClose={handleCloseDocument} onDelete={handleDelete} onChunksLoaded={setDocChunks} chunks={docChunks} chunksLoading={chunksLoading} setChunksLoading={setChunksLoading} />
      )}

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={registerUploadedDocument} />
      {renameDoc && <div className="modal-overlay" onClick={() => !renameSaving && setRenameDoc(null)}>
        <form className="modal-card" onClick={(event) => event.stopPropagation()} onSubmit={async (event) => {
          event.preventDefault()
          if (!token || !renameTitle.trim() || renameSaving) return
          setRenameSaving(true)
          setRenameError(null)
          try {
            const updated = await updateDocument(renameDoc.id, { title: renameTitle.trim() }, token)
            applyDocumentAccess(updated)
            setRenameDoc(null)
          } catch (error) { setRenameError(error instanceof Error ? error.message : 'Update failed') }
          finally { setRenameSaving(false) }
        }}>
          <div className="modal-header"><h2>{isId ? 'Ubah nama dokumen' : 'Rename document'}</h2><button type="button" className="icon-button" aria-label={isId ? 'Tutup' : 'Close'} disabled={renameSaving} onClick={() => setRenameDoc(null)}><X size={18} /></button></div>
          <div className="modal-body">
            {renameError && <div className="upload-error-msg" role="alert" ref={renameErrorRef}>{renameError}</div>}
            <div className="upload-field">
              <label htmlFor="rename-document-title">{isId ? 'Nama dokumen' : 'Document title'}</label>
              <input id="rename-document-title" required maxLength={255} value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} autoFocus />
            </div>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" disabled={renameSaving} onClick={() => setRenameDoc(null)}>{isId ? 'Batal' : 'Cancel'}</button><button className="primary-button" disabled={renameSaving || !renameTitle.trim()}>{renameSaving ? (isId ? 'Menyimpan...' : 'Saving...') : (isId ? 'Simpan' : 'Save')}</button></div>
        </form>
      </div>}
      {deleteDoc && <div className="modal-overlay" onClick={() => !deleteBusy && setDeleteDoc(null)}>
        <div className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-document-title" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header"><h2 id="delete-document-title">{isId ? 'Hapus dokumen' : 'Delete document'}</h2><button type="button" className="icon-button" aria-label={isId ? 'Tutup' : 'Close'} disabled={deleteBusy} onClick={() => setDeleteDoc(null)}><X size={18} /></button></div>
          <div className="modal-body">
            <p className="modal-copy">{isId ? <>Dokumen <strong>{deleteDoc.name}</strong> akan dihapus permanen beserta seluruh potongan teks yang sudah diindeks. Tindakan ini tidak bisa dibatalkan.</> : <>Document <strong>{deleteDoc.name}</strong> will be permanently deleted along with every indexed chunk. This action cannot be undone.</>}</p>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" disabled={deleteBusy} onClick={() => setDeleteDoc(null)}>{isId ? 'Batal' : 'Cancel'}</button><button type="button" className="danger-button" disabled={deleteBusy} autoFocus onClick={confirmDelete}>{deleteBusy ? (isId ? 'Menghapus...' : 'Deleting...') : (isId ? 'Hapus dokumen' : 'Delete document')}</button></div>
        </div>
      </div>}
      <DocumentAccessModal open={showDocumentAccess} onClose={() => setShowDocumentAccess(false)} />

      {/* Atur akses: kategori sebagai penanda subjek, penanda unit sebagai
          satu-satunya pembatas siapa yang boleh membaca dan menanyakannya. */}
      {accessDoc && (
        <div className="modal-overlay" onClick={() => !accessSaving && setAccessDoc(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{isId ? 'Atur akses dokumen' : 'Document access'}</h2>
                <p className="modal-copy">{accessDoc.name}</p>
              </div>
              <button className="icon-button" onClick={() => setAccessDoc(null)} disabled={accessSaving}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="upload-field">
                <label><FolderOpen size={13} style={{ marginRight: 4, verticalAlign: -1 }} />{isId ? 'Kategori' : 'Category'}</label>
                <div className="upload-collection-grid">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`upload-collection-chip ${accessCategoryId === category.id ? 'active' : ''}`}
                      onClick={() => setAccessCategoryId(accessCategoryId === category.id ? '' : category.id)}
                      disabled={accessSaving}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
                <p className="field-hint">
                  {isId
                    ? 'Penanda subjek untuk pencarian dan filter. Tidak membatasi siapa pun.'
                    : 'A subject label for search and filtering. It restricts nobody.'}
                </p>
              </div>

              <div className="upload-field">
                <label><Building2 size={13} style={{ marginRight: 4, verticalAlign: -1 }} />{isId ? 'Batasi ke unit kerja' : 'Restrict to work unit'}</label>
                <label className="upload-restrict-toggle">
                  <input
                    type="checkbox"
                    checked={accessRestrict}
                    onChange={(event) => setAccessRestrict(event.target.checked)}
                    disabled={accessSaving}
                  />
                  <span>{isId ? 'Hanya untuk satu unit kerja tertentu' : 'Only for one specific work unit'}</span>
                </label>
                {accessRestrict && (
                  <div className="select-wrapper" style={{ marginTop: 8 }}>
                    <select value={accessUnitId} onChange={(event) => setAccessUnitId(event.target.value)} disabled={accessSaving}>
                      <option value="">{isId ? '— Pilih unit kerja —' : '— Select work unit —'}</option>
                      {unitKerjaList.map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="field-hint">
                  {isId
                    ? 'Terkunci berarti hanya unit itu yang bisa membuka dokumennya dan mendapat jawabannya dari Asisten AI. Lepas centang untuk membukanya kembali bagi seluruh pegawai.'
                    : 'Locked means only that unit can open the document and get answers from it in the AI assistant. Uncheck to reopen it to every employee.'}
                </p>
              </div>
              {accessError && <div className="upload-error-msg" role="alert" ref={accessErrorRef}>{accessError}</div>}
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setAccessDoc(null)} disabled={accessSaving}>{isId ? 'Batal' : 'Cancel'}</button>
              <button className="primary-button" onClick={saveAccess} disabled={accessSaving}>
                {accessSaving ? (isId ? 'Menyimpan…' : 'Saving…') : (isId ? 'Simpan' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
