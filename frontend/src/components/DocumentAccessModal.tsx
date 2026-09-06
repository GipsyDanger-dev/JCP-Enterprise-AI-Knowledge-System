import { useEffect, useMemo, useState } from 'react'
import { Building2, Globe2, Loader2, Search, X } from 'lucide-react'
import { listDocumentCategories, updateDocumentAccess } from '@/api/documents'
import { getUserReferenceData } from '@/api/users'
import { errorMessage } from '@/api/client'
import type { ApiDocumentCategory, ApiUnitKerja } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

interface DocumentAccessModalProps {
  open: boolean
  onClose: () => void
}

/** Nilai penyaring akses: semua, hanya yang terbuka, atau satu unit kerja. */
const ACCESS_ALL = ''
const ACCESS_OPEN = 'open'

/**
 * Manajemen dokumen: mengunci dokumen ke satu unit kerja, atau membukanya
 * kembali untuk seluruh pegawai.
 *
 * Sengaja berupa daftar semua dokumen sekaligus, bukan satu dokumen per
 * dialog. Pertanyaan yang dibawa admin ke sini hampir selalu "apa saja yang
 * sekarang terkunci?" — dan itu hanya terjawab kalau seluruhnya terlihat
 * berjajar. Penyaring kategori dan akses ada supaya dokumen satu dinas bisa
 * dikumpulkan dulu, baru dicentang bersama-sama: mengunci belasan dokumen satu
 * per satu adalah cara paling mudah untuk keliru melewatkan satu.
 */
export function DocumentAccessModal({ open, onClose }: DocumentAccessModalProps) {
  const { token } = useAuth()
  const { documents, applyDocumentAccess, language } = useWorkspace()
  const isId = language === 'id'
  const [unitKerjaList, setUnitKerjaList] = useState<ApiUnitKerja[]>([])
  const [categories, setCategories] = useState<ApiDocumentCategory[]>([])
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [accessFilter, setAccessFilter] = useState(ACCESS_ALL)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkUnitId, setBulkUnitId] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !token) return
    let batal = false
    getUserReferenceData(token)
      .then((data) => { if (!batal) setUnitKerjaList(data.unitKerja) })
      .catch(() => { if (!batal) setUnitKerjaList([]) })
    listDocumentCategories(token)
      .then((data) => { if (!batal) setCategories(data) })
      .catch(() => { if (!batal) setCategories([]) })
    return () => { batal = true }
  }, [open, token])

  // Pilihan dan penyaring dikosongkan tiap kali dialog dibuka: centang sisa
  // sesi sebelumnya adalah cara paling mudah mengunci dokumen yang salah.
  useEffect(() => {
    if (open) return
    setSelectedIds([])
    setQuery('')
    setCategoryFilter('')
    setAccessFilter(ACCESS_ALL)
    setBulkUnitId('')
    setRowError(null)
    setBulkError(null)
  }, [open])

  const filtered = useMemo(() => documents.filter((document) => {
    if (!document.name.toLowerCase().includes(query.toLowerCase())) return false
    if (categoryFilter && document.categoryId !== categoryFilter) return false
    if (accessFilter === ACCESS_OPEN) return !document.unitKerja
    if (accessFilter) return document.unitKerja?.id === accessFilter
    return true
  }), [documents, query, categoryFilter, accessFilter])

  const lockedCount = useMemo(() => documents.filter((document) => document.unitKerja).length, [documents])
  // Yang bisa ditindak massal hanyalah yang sedang tampil: mencentang "semua"
  // lalu diam-diam ikut mengubah dokumen di luar penyaring akan mengejutkan.
  const selectedVisible = useMemo(
    () => filtered.filter((document) => selectedIds.includes(document.id)),
    [filtered, selectedIds],
  )
  const allVisibleSelected = filtered.length > 0 && selectedVisible.length === filtered.length
  const busy = Boolean(savingId) || bulkSaving

  if (!open) return null

  const toggleOne = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const toggleAllVisible = () => {
    const visibleIds = filtered.map((document) => document.id)
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])))
  }

  const changeUnit = async (documentId: string, unitKerjaId: string) => {
    if (!token || busy) return
    setSavingId(documentId)
    setRowError(null)
    try {
      // Nilai kosong berarti kuncinya dilepas. Kategori tidak ikut dikirim,
      // jadi penanda subjeknya tetap apa adanya.
      const updated = await updateDocumentAccess(documentId, { unitKerjaId: unitKerjaId || null }, token)
      applyDocumentAccess(updated)
    } catch (error) {
      setRowError({ id: documentId, message: errorMessage(error) })
    } finally {
      setSavingId(null)
    }
  }

  const applyBulk = async () => {
    if (!token || busy || selectedVisible.length === 0) return
    setBulkSaving(true)
    setBulkError(null)
    setRowError(null)
    const gagal: string[] = []
    // Satu per satu, bukan Promise.all: kalau sebagian gagal, admin perlu tahu
    // persis dokumen mana — dan yang berhasil tetap tersimpan.
    for (const document of selectedVisible) {
      try {
        const updated = await updateDocumentAccess(document.id, { unitKerjaId: bulkUnitId || null }, token)
        applyDocumentAccess(updated)
      } catch {
        gagal.push(document.name)
      }
    }
    setBulkSaving(false)
    if (gagal.length > 0) {
      setBulkError(isId
        ? `${gagal.length} dokumen gagal disimpan: ${gagal.slice(0, 3).join(', ')}${gagal.length > 3 ? '…' : ''}`
        : `${gagal.length} documents could not be saved: ${gagal.slice(0, 3).join(', ')}${gagal.length > 3 ? '…' : ''}`)
      return
    }
    setSelectedIds([])
  }

  const bulkTargetLabel = bulkUnitId
    ? unitKerjaList.find((unit) => unit.id === bulkUnitId)?.name ?? ''
    : (isId ? 'terbuka untuk semua' : 'open to everyone')

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-card doc-access-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{isId ? 'Manajemen dokumen' : 'Document management'}</h2>
            <p className="modal-copy">
              {isId
                ? `${documents.length} dokumen · ${lockedCount} terkunci untuk satu unit kerja`
                : `${documents.length} documents · ${lockedCount} locked to a single work unit`}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="doc-access-filters">
            <div className="filter-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={isId ? 'Cari dokumen' : 'Search documents'}
              />
            </div>
            <div className="select-wrapper">
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">{isId ? 'Semua kategori' : 'All categories'}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
            <div className="select-wrapper">
              <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)}>
                <option value={ACCESS_ALL}>{isId ? 'Semua akses' : 'All access'}</option>
                <option value={ACCESS_OPEN}>{isId ? 'Terbuka untuk semua' : 'Open to everyone'}</option>
                {unitKerjaList.map((unit) => (
                  <option key={unit.id} value={unit.id}>{isId ? `Terkunci: ${unit.name}` : `Locked: ${unit.name}`}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="field-hint">
            {isId
              ? 'Dokumen tanpa kunci terbuka untuk seluruh pegawai — termasuk jawaban Asisten AI. Begitu dikunci, hanya unit kerja itu yang bisa membuka dan menanyakannya.'
              : 'An unlocked document is open to every employee, AI answers included. Once locked, only that work unit can open it or ask about it.'}
          </p>

          <div className="doc-access-list">
            {filtered.length === 0 ? (
              <p className="empty-row">{isId ? 'Tidak ada dokumen ditemukan.' : 'No documents found.'}</p>
            ) : filtered.map((document) => (
              <div key={document.id} className={`doc-access-row${selectedIds.includes(document.id) ? ' is-selected' : ''}`}>
                <input
                  type="checkbox"
                  className="doc-access-check"
                  checked={selectedIds.includes(document.id)}
                  onChange={() => toggleOne(document.id)}
                  disabled={busy}
                  aria-label={isId ? `Pilih ${document.name}` : `Select ${document.name}`}
                />
                <div className="doc-access-name">
                  <strong>{document.name}</strong>
                  <small>
                    {document.unitKerja
                      ? <><Building2 size={11} /> {document.unitKerja.name}</>
                      : <><Globe2 size={11} /> {isId ? 'Terbuka untuk semua pegawai' : 'Open to every employee'}</>}
                  </small>
                </div>
                <div className="doc-access-control">
                  <div className="select-wrapper">
                    <select
                      value={document.unitKerja?.id ?? ''}
                      onChange={(event) => changeUnit(document.id, event.target.value)}
                      disabled={busy}
                      aria-label={isId ? `Akses ${document.name}` : `Access for ${document.name}`}
                    >
                      <option value="">{isId ? 'Terbuka untuk semua' : 'Open to everyone'}</option>
                      {unitKerjaList.map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                      ))}
                    </select>
                  </div>
                  {savingId === document.id && <Loader2 size={15} className="spin" />}
                </div>
                {rowError?.id === document.id && (
                  <p className="doc-access-error" role="alert">{rowError.message}</p>
                )}
              </div>
            ))}
          </div>

          {(bulkError || selectedVisible.length > 0) && (
            <p
              className={bulkError ? 'doc-access-error doc-access-foot' : 'field-hint doc-access-foot'}
              role={bulkError ? 'alert' : undefined}
            >
              {bulkError ?? (isId
                ? `${selectedVisible.length} dokumen terpilih akan menjadi ${bulkTargetLabel}.`
                : `${selectedVisible.length} selected documents will become ${bulkTargetLabel}.`)}
            </p>
          )}
        </div>

        <div className="modal-actions doc-access-actions">
          <label className="doc-access-select-all">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={busy || filtered.length === 0}
            />
            <span>
              {isId
                ? `Pilih semua yang tampil (${filtered.length})`
                : `Select all shown (${filtered.length})`}
            </span>
          </label>

          {selectedVisible.length > 0 && (
            <div className="doc-access-bulk">
              <div className="select-wrapper">
                <select
                  value={bulkUnitId}
                  onChange={(event) => setBulkUnitId(event.target.value)}
                  disabled={busy}
                  aria-label={isId ? 'Akses untuk dokumen terpilih' : 'Access for selected documents'}
                >
                  <option value="">{isId ? 'Terbuka untuk semua' : 'Open to everyone'}</option>
                  {unitKerjaList.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
              </div>
              <button className="primary-button" onClick={applyBulk} disabled={busy}>
                {bulkSaving
                  ? <><Loader2 size={15} className="spin" /> {isId ? 'Menyimpan…' : 'Saving…'}</>
                  : (isId
                      ? `Terapkan ke ${selectedVisible.length} dokumen`
                      : `Apply to ${selectedVisible.length} documents`)}
              </button>
            </div>
          )}

          <button className="secondary-button" onClick={onClose} disabled={busy}>
            {isId ? 'Tutup' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
