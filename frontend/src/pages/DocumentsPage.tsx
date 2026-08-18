import { useMemo, useState } from 'react'
import { ArrowUpRight, ChevronDown, FileText, FolderOpen, LoaderCircle, Search, ShieldAlert, Trash2, Upload } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { StatusBadge } from '@/components/StatusBadge'
import { useWorkspace } from '@/hooks/useWorkspace'

export function DocumentsPage() {
  const { documents, triggerUpload, role, isUploading, uploadError, removeDocument } = useWorkspace()
  const canManage = role === 'admin'
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => documents.filter((document) => document.name.toLowerCase().includes(query.toLowerCase())), [documents, query])

  const handleDelete = async (id: number, name: string) => {
    if (window.confirm(`Hapus dokumen "${name}"?`)) {
      await removeDocument(id)
    }
  }

  const action = canManage ? (
    <button className="primary-button" onClick={triggerUpload} disabled={isUploading}>
      {isUploading ? <LoaderCircle size={17} className="spin" /> : <Upload size={17} />}
      {isUploading ? 'Mengunggah…' : 'Upload document'}
    </button>
  ) : undefined

  return (
    <div className="standard-page">
      <PageHeading eyebrow="Knowledge base" title={canManage ? 'Documents' : 'Knowledge library'} detail={canManage ? `${documents.length} sources connected to this workspace.` : `${documents.length} trusted sources available to you.`} action={action} />
      {uploadError && <div className="inline-alert" role="alert"><ShieldAlert size={15} /> {uploadError}</div>}
      <div className="table-toolbar">
        <div className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents" /></div>
        <button className="secondary-button"><FolderOpen size={16} /> All collections <ChevronDown size={14} /></button>
      </div>
      <div className="data-table">
        <table>
          <thead><tr><th>Document</th><th>Collection</th><th>Updated</th><th>Status</th><th>Chunks</th><th aria-label="Actions" /></tr></thead>
          <tbody>{filtered.map((document) => (
            <tr key={document.id}>
              <td><div className="document-name"><span><FileText size={18} /></span><strong>{document.name}</strong></div></td>
              <td>{document.collection}</td>
              <td>{document.updatedAt}</td>
              <td><StatusBadge status={document.status} /></td>
              <td>{document.chunks ?? '—'}</td>
              <td>{canManage
                ? <button className="icon-button danger" title={`Delete ${document.name}`} onClick={() => handleDelete(document.id, document.name)}><Trash2 size={16} /></button>
                : <button className="icon-button" title={`Open ${document.name}`}><ArrowUpRight size={16} /></button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}
