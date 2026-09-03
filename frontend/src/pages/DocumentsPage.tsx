import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, BookOpenCheck, CheckCircle2, ChevronDown, Download, FileText, FolderOpen, Search, ShieldAlert, Trash2, Upload, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { StatusBadge } from '@/components/StatusBadge'
import { UploadModal } from '@/components/UploadModal'
import { downloadDocument, getDocumentBlob, getDocumentChunks, listDocumentCategories, type DocumentChunk } from '@/api/documents'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import type { DocumentItem } from '@/types/domain'
import type { ApiDocumentCategory } from '@/api/types'
import { assignRequiredReading, completeRequiredReading, listMyRequiredReadings, requiredReadingReport, updateRequiredReadingProgress, type RequiredReadingReport } from '@/api/requiredReadings'
import { listUsers } from '@/api/users'
import type { ApiUser } from '@/api/types'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

function PdfReader({ source, title }: { source: string; title: string }) {
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
    }).catch(() => {})
    return () => { cancelled = true; task.destroy() }
  }, [source, title])
  return <div ref={containerRef} className="doc-reader-pdf-pages" />
}

function DocViewer({ doc, isId, canManage, token, requiredReadingId, onClose, onDelete, onChunksLoaded, chunks, chunksLoading, setChunksLoading }: {
  doc: DocumentItem
  isId: boolean
  canManage: boolean
  token: string | null
  requiredReadingId: string | null
  onClose: () => void
  onDelete: (id: string, name: string) => void
  onChunksLoaded: (chunks: DocumentChunk[]) => void
  chunks: DocumentChunk[]
  chunksLoading: boolean
  setChunksLoading: (v: boolean) => void
}) {
  const extension = doc.name.split('.').pop()?.toLowerCase()
  const canRenderOriginal = extension === 'pdf' || extension === 'docx' || extension === 'txt' || extension === 'md'
  const [readerUrl, setReaderUrl] = useState<string | null>(null)
  const [readerText, setReaderText] = useState<string | null>(null)
  const [readerLoading, setReaderLoading] = useState(false)
  const [readerError, setReaderError] = useState(false)
  const viewerRef = useRef<HTMLDivElement>(null)
  const [canComplete, setCanComplete] = useState(false)
  const [completionConfirmed, setCompletionConfirmed] = useState(false)
  const [completionSaving, setCompletionSaving] = useState(false)
  const trackReading = () => { const el = viewerRef.current; if (!el || !requiredReadingId || !token) return; const progress = Math.min(99, Math.round((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 100)); setCanComplete(progress >= 95); updateRequiredReadingProgress(requiredReadingId, progress, token).catch(() => {}) }
  const completeReading = async () => {
    if (!requiredReadingId || !token || !canComplete || completionSaving) return
    setCompletionSaving(true)
    try {
      await updateRequiredReadingProgress(requiredReadingId, 99, token)
      await completeRequiredReading(requiredReadingId, token)
      setCanComplete(false)
      setCompletionConfirmed(true)
    } finally {
      setCompletionSaving(false)
    }
  }

  useEffect(() => {
    if (!requiredReadingId || !token) return
    listMyRequiredReadings(token).then((items) => {
      const reading = items.find((item) => item.id === requiredReadingId)
      if (!reading) return
      setCanComplete(reading.progress >= 95 && reading.progress < 100)
      setCompletionConfirmed(reading.progress >= 100)
    }).catch(() => {})
  }, [requiredReadingId, token])

  useEffect(() => {
    if (doc.status !== 'Ready' || canRenderOriginal || chunks.length > 0) return
    setChunksLoading(true)
    getDocumentChunks(doc.id, token ?? undefined)
      .then((res) => onChunksLoaded(res.chunks))
      .catch(() => onChunksLoaded([]))
      .finally(() => setChunksLoading(false))
  }, [canRenderOriginal, chunks.length, doc.id, doc.status, onChunksLoaded, setChunksLoading, token])

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
                {completionConfirmed && <span className="reading-verification-badge" role="status"><CheckCircle2 size={14} /> {isId ? 'Pembacaan terverifikasi' : 'Reading verified'}</span>}
              </span>
            </div>
          </div>
          <div className="doc-viewer-actions">
            {requiredReadingId && <button className={completionConfirmed ? 'reading-complete-button' : 'primary-button'} disabled={completionSaving || completionConfirmed || !canComplete} onClick={completeReading}>{completionConfirmed ? <><CheckCircle2 size={17} /> {isId ? 'Terverifikasi selesai' : 'Verified complete'}</> : (completionSaving ? (isId ? 'Memverifikasi...' : 'Verifying...') : (isId ? 'Tandai selesai' : 'Mark complete'))}</button>}
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
        <div className="doc-viewer-content" ref={viewerRef} onScroll={trackReading}>
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
          {doc.status === 'Ready' && !readerLoading && readerUrl && <PdfReader source={readerUrl} title={doc.name} />}
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
          {doc.status === 'Ready' && !canRenderOriginal && !chunksLoading && pages.length > 0 && (
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
  const requestedDocumentId = searchParams.get('doc')
  const requestedAssignmentDocumentId = searchParams.get('assign')
  const requiredReadingId = searchParams.get('reading')
  const [query, setQuery] = useState(initialQuery)
  const [collection, setCollection] = useState(initialCollection)
  // Kategori datang dari server dan sudah tersaring: hanya yang benar-benar
  // bisa diakses pengguna ini yang ikut terkirim.
  const [categories, setCategories] = useState<ApiDocumentCategory[]>([])
  const [showCollections, setShowCollections] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [docChunks, setDocChunks] = useState<DocumentChunk[]>([])
  const [chunksLoading, setChunksLoading] = useState(false)
  const [assignmentDoc, setAssignmentDoc] = useState<DocumentItem | null>(null)
  const [employees, setEmployees] = useState<ApiUser[]>([])
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const [assignmentView, setAssignmentView] = useState<'assign' | 'progress'>('assign')
  const [readingReport, setReadingReport] = useState<RequiredReadingReport[]>([])
  const [selectedDivision, setSelectedDivision] = useState('')
  const [assignmentError, setAssignmentError] = useState<string | null>(null)

  useEffect(() => {
    if (!requestedDocumentId || selectedDoc) return
    const document = documents.find((item) => item.id === requestedDocumentId)
    if (document) setSelectedDoc(document)
  }, [documents, requestedDocumentId, selectedDoc])

  useEffect(() => {
    if (!requestedAssignmentDocumentId || assignmentDoc) return
    const document = documents.find((item) => item.id === requestedAssignmentDocumentId)
    if (!document) return
    setSelectedDivision('')
    setAssignmentError(null)
    setSelectedEmployeeIds([])
    setAssignmentView('progress')
    setAssignmentDoc(document)
  }, [assignmentDoc, documents, requestedAssignmentDocumentId])

  useEffect(() => {
    if (!assignmentDoc || !token) return
    let active = true
    Promise.all([listUsers(token), requiredReadingReport(token)]).then(([users, report]) => {
      if (!active) return
      const activeEmployees = users.filter((user) => user.isActive !== false && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')
      const assignedIds = new Set((report.find((item) => item.documentId === assignmentDoc.id)?.readers ?? []).map((reader) => reader.userId))
      setEmployees(activeEmployees)
      setReadingReport(report)
      setSelectedEmployeeIds(activeEmployees.filter((employee) => !assignedIds.has(employee.id)).map((employee) => employee.id))
    }).catch(() => { if (active) { setEmployees([]); setSelectedEmployeeIds([]); setReadingReport([]) } })
    return () => { active = false }
  }, [assignmentDoc, token])

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
  const divisions = useMemo(() => Array.from(new Set(employees.map((employee) => employee.division))).sort(), [employees])
  const visibleEmployees = selectedDivision ? employees.filter((employee) => employee.division === selectedDivision) : employees
  const assignedEmployeeIds = useMemo(() => new Set((readingReport.find((item) => item.documentId === assignmentDoc?.id)?.readers ?? []).map((reader) => reader.userId)), [assignmentDoc?.id, readingReport])
  const visibleAssignableEmployees = useMemo(() => visibleEmployees.filter((employee) => !assignedEmployeeIds.has(employee.id)), [assignedEmployeeIds, visibleEmployees])
  const selectedAssignableEmployeeIds = useMemo(() => selectedEmployeeIds.filter((id) => !assignedEmployeeIds.has(id)), [assignedEmployeeIds, selectedEmployeeIds])

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
    nextSearchParams.delete('reading')
    setSearchParams(nextSearchParams)
  }

  const handleCloseAssignment = () => {
    setAssignmentDoc(null)
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('assign')
    setSearchParams(nextSearchParams)
  }

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Hapus dokumen "${name}"?`)) {
      await removeDocument(id)
      if (selectedDoc?.id === id) setSelectedDoc(null)
    }
  }
  const assignReading = async () => {
    if (!token || !assignmentDoc || selectedAssignableEmployeeIds.length === 0) return
    setAssigning(true)
    setAssignmentError(null)
    try {
      await assignRequiredReading(assignmentDoc.id, selectedAssignableEmployeeIds, token)
      const report = await requiredReadingReport(token)
      setReadingReport(report)
      setSelectedEmployeeIds([])
      setAssignmentView('progress')
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : (isId ? 'Penugasan gagal disimpan.' : 'Assignment could not be saved.'))
    } finally {
      setAssigning(false)
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
                  ? <>{document.status === 'Ready' && <button className="icon-button" title={isId ? 'Jadikan wajib baca' : 'Assign required reading'} onClick={(e) => { e.stopPropagation(); setSelectedDivision(''); setAssignmentError(null); setSelectedEmployeeIds([]); setAssignmentView('assign'); setAssignmentDoc(document) }}><BookOpenCheck size={16} /></button>}<button className="icon-button danger" title={`Delete ${document.name}`} onClick={(e) => { e.stopPropagation(); handleDelete(document.id, document.name) }}><Trash2 size={16} /></button></>
                  : <button className="icon-button" title={`Open ${document.name}`} onClick={(e) => { e.stopPropagation(); setSelectedDoc(document) }}><ArrowUpRight size={16} /></button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* Document detail — full-screen viewer */}
      {selectedDoc && (
        <DocViewer doc={selectedDoc} isId={isId} canManage={canManage} token={token} requiredReadingId={requiredReadingId} onClose={handleCloseDocument} onDelete={handleDelete} onChunksLoaded={setDocChunks} chunks={docChunks} chunksLoading={chunksLoading} setChunksLoading={setChunksLoading} />
      )}

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={registerUploadedDocument} />
      {assignmentDoc && (
        <div className="modal-overlay" onClick={handleCloseAssignment}>
          <div className="modal-card assignment-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div><h2>{isId ? 'Wajib baca' : 'Required reading'}</h2><p className="modal-copy">{assignmentDoc.name}</p></div>
              <button className="icon-button" onClick={handleCloseAssignment}><X size={18} /></button>
            </div>
            <div className="assignment-tabs">
              <button className={assignmentView === 'assign' ? 'active' : ''} onClick={() => setAssignmentView('assign')}>{isId ? 'Tetapkan' : 'Assign'}</button>
              <button className={assignmentView === 'progress' ? 'active' : ''} onClick={() => setAssignmentView('progress')}>{isId ? 'Progres' : 'Progress'}</button>
            </div>
            <div className="modal-body">
              {assignmentView === 'assign' ? <>
                <div className="assignment-target">
                  <label htmlFor="assignment-division">{isId ? 'Target divisi' : 'Target division'}</label>
                  <select id="assignment-division" value={selectedDivision} onChange={(event) => {
                    const division = event.target.value
                    setSelectedDivision(division)
                    setSelectedEmployeeIds((division ? employees.filter((employee) => employee.division === division) : employees).filter((employee) => !assignedEmployeeIds.has(employee.id)).map((employee) => employee.id))
                  }}>
                    <option value="">{isId ? 'Semua divisi' : 'All divisions'}</option>
                    {divisions.map((division) => <option key={division} value={division}>{division}</option>)}
                  </select>
                </div>
                <label className="assignment-select-all">
                  <input type="checkbox" disabled={visibleAssignableEmployees.length === 0} checked={visibleAssignableEmployees.length > 0 && visibleAssignableEmployees.every((employee) => selectedEmployeeIds.includes(employee.id))} onChange={() => setSelectedEmployeeIds((ids) => visibleAssignableEmployees.every((employee) => ids.includes(employee.id)) ? ids.filter((id) => !visibleAssignableEmployees.some((employee) => employee.id === id)) : Array.from(new Set([...ids, ...visibleAssignableEmployees.map((employee) => employee.id)])))} />
                  {isId ? 'Pilih semua karyawan yang tampil' : 'Select all visible employees'}
                </label>
                <div className="assignment-table">
                  {visibleEmployees.map((employee) => {
                    const alreadyAssigned = assignedEmployeeIds.has(employee.id)
                    return <label key={employee.id} className={`assignment-person${alreadyAssigned ? ' is-assigned' : ''}`}>
                      <input type="checkbox" disabled={alreadyAssigned} checked={alreadyAssigned || selectedEmployeeIds.includes(employee.id)} onChange={() => setSelectedEmployeeIds((ids) => ids.includes(employee.id) ? ids.filter((id) => id !== employee.id) : [...ids, employee.id])} />
                      <span><strong>{employee.displayName}</strong><small>{employee.employeeNumber} · {employee.division} · {employee.jobTitle}{alreadyAssigned && <> · <em>{isId ? 'Sudah ditugaskan' : 'Already assigned'}</em></>}</small></span>
                      {alreadyAssigned && <CheckCircle2 className="assignment-person-status" size={18} aria-label={isId ? 'Sudah ditugaskan' : 'Already assigned'} />}
                    </label>
                  })}
                </div>
              </> : <div className="assignment-progress-list">
                {(readingReport.find((item) => item.documentId === assignmentDoc.id)?.readers ?? []).map((reader) => <div className="reading-report-person" key={reader.employeeNumber}>
                  <span><strong>{reader.displayName}</strong><small>{reader.employeeNumber} · {reader.division} · {reader.jobTitle}</small></span>
                  <b>{reader.progress === 100 ? (isId ? 'Selesai' : 'Complete') : `${reader.progress}%`}</b>
                </div>)}
                {!(readingReport.find((item) => item.documentId === assignmentDoc.id)?.readers.length) && <p className="empty-row">{isId ? 'Belum ada karyawan yang ditugaskan.' : 'No employees assigned yet.'}</p>}
              </div>}
            </div>
            <div className="modal-actions">
              {assignmentError && <p className="assignment-error" role="alert">{assignmentError}</p>}
              <button className="secondary-button" onClick={handleCloseAssignment}>{isId ? 'Tutup' : 'Close'}</button>
              {assignmentView === 'assign' && <button className="primary-button" disabled={assigning || selectedAssignableEmployeeIds.length === 0} onClick={assignReading}>{assigning ? (isId ? 'Menyimpan...' : 'Saving...') : (selectedAssignableEmployeeIds.length === 0 ? (isId ? 'Semua sudah ditugaskan' : 'All already assigned') : (isId ? `Tetapkan (${selectedAssignableEmployeeIds.length})` : `Assign (${selectedAssignableEmployeeIds.length})`))}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
