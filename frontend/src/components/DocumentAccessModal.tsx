import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, FolderOpen, Globe2, Loader2, Search, X } from 'lucide-react'
import { listDocumentCategories, updateDocumentAccess, type DocumentAccessInput } from '@/api/documents'
import { getUserReferenceData } from '@/api/users'
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
 * Nilai kendali massal.
 *
 * Kedua kendali mengikuti keadaan dokumen yang sedang dicentang: centang satu
 * dokumen berkategori Seni, dan kotak kategorinya langsung menunjuk Seni. Jadi
 * yang tampil selalu keadaan sekarang, dan menekan Terapkan tanpa mengubah apa
 * pun tidak menggeser apa-apa.
 *
 * BULK_NONE adalah pilihan sungguhan — tanpa kategori, atau terbuka untuk
 * seluruh pegawai — sedangkan BULK_KEEP bukan pilihan yang bisa diambil
 * sendiri: ia muncul hanya ketika belum ada yang dicentang, atau ketika yang
 * dicentang punya kategori/akses yang berbeda-beda sehingga tidak ada satu
 * nilai yang jujur mewakilinya. Dalam keadaan itu kolomnya memang tidak ikut
 * dikirim, supaya menyeragamkan kategori tidak diam-diam menyeragamkan kunci.
 */
const BULK_KEEP = ''
const BULK_NONE = '__none__'

/** Nilai yang sama untuk seluruh dokumen terpilih, atau null kalau beragam. */
const nilaiSeragam = (nilai: string[]) => {
  if (nilai.length === 0) return null
  return nilai.every((item) => item === nilai[0]) ? nilai[0] : null
}

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
 *
 * Kategori dan aksesnya hanya bisa diubah lewat satu kendali di baris bawah.
 * Dulu tiap baris punya daftar pilihannya sendiri, dan dua puluh delapan kotak
 * pilihan berjajar membuat mata tidak tahu harus berhenti di mana — sekarang
 * barisnya cuma menyatakan keadaan sekarang, dan yang mengubah hanya ada satu.
 *
 * Keduanya dipilih terpisah. Kategori mulai dari "bawaan" (tidak disentuh),
 * akses mulai dari "terbuka untuk semua" — lihat catatan pada BULK_KEEP.
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
  const [bulkCategoryId, setBulkCategoryId] = useState(BULK_KEEP)
  const [bulkUnitId, setBulkUnitId] = useState(BULK_KEEP)
  const [bulkSaving, setBulkSaving] = useState(false)
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
    setBulkCategoryId(BULK_KEEP)
    setBulkUnitId(BULK_KEEP)
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
  const busy = bulkSaving

  /*
   * Kedua kendali mengikuti dokumen yang dicentang.
   *
   * Sengaja bergantung pada selectedIds saja, bukan pada selectedVisible:
   * daftar dokumen ikut disegarkan polling status tiap beberapa detik, dan
   * sebagai dependensi ia akan menimpa pilihan yang sedang diketik admin di
   * tengah jalan. Isinya dibaca lewat ref yang selalu berisi render terakhir.
   */
  const terpilihRef = useRef(selectedVisible)
  terpilihRef.current = selectedVisible
  useEffect(() => {
    const terpilih = terpilihRef.current
    setBulkCategoryId(nilaiSeragam(terpilih.map((document) => document.categoryId ?? BULK_NONE)) ?? BULK_KEEP)
    setBulkUnitId(nilaiSeragam(terpilih.map((document) => document.unitKerja?.id ?? BULK_NONE)) ?? BULK_KEEP)
  }, [selectedIds])

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

  /**
   * Perubahan yang akan dikirim. Field yang tidak ada di sini berarti "jangan
   * diubah" — pembedaan undefined/null itu ditegakkan server, jadi kategori dan
   * kunci unit bisa diurus terpisah tanpa yang satu menimpa yang lain.
   */
  const perubahan = (): DocumentAccessInput => {
    const input: DocumentAccessInput = {}
    if (bulkCategoryId !== BULK_KEEP) input.categoryId = bulkCategoryId === BULK_NONE ? null : bulkCategoryId
    if (bulkUnitId !== BULK_KEEP) input.unitKerjaId = bulkUnitId === BULK_NONE ? null : bulkUnitId
    return input
  }

  const adaPerubahan = bulkCategoryId !== BULK_KEEP || bulkUnitId !== BULK_KEEP

  const applyBulk = async () => {
    if (!token || busy || selectedVisible.length === 0 || !adaPerubahan) return
    const input = perubahan()
    setBulkSaving(true)
    setBulkError(null)
    const gagal: string[] = []
    // Satu per satu, bukan Promise.all: kalau sebagian gagal, admin perlu tahu
    // persis dokumen mana — dan yang berhasil tetap tersimpan.
    for (const document of selectedVisible) {
      try {
        const updated = await updateDocumentAccess(document.id, input, token)
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
    // Centangnya dilepas; kedua kendali ikut kembali sendiri lewat efek di
    // atas, karena tidak ada lagi dokumen yang mereka cerminkan.
    setSelectedIds([])
  }

  /**
   * Kalimat yang menyebutkan apa yang akan terjadi, disusun dari bagian yang
   * benar-benar diubah saja. Kalimat tetap yang menyebut kategori DAN akses
   * sekaligus akan membuat orang mengira keduanya ikut ditimpa.
   */
  const frasaKategori = () => {
    if (bulkCategoryId === BULK_KEEP) return null
    if (bulkCategoryId === BULK_NONE) return isId ? 'tanpa kategori' : 'without a category'
    const nama = categories.find((category) => category.id === bulkCategoryId)?.name ?? ''
    return isId ? `berkategori ${nama}` : `in ${nama}`
  }

  const frasaAkses = () => {
    if (bulkUnitId === BULK_KEEP) return null
    if (bulkUnitId === BULK_NONE) return isId ? 'terbuka untuk seluruh pegawai' : 'open to every employee'
    const nama = unitKerjaList.find((unit) => unit.id === bulkUnitId)?.name ?? ''
    return isId ? `terkunci untuk ${nama}` : `locked to ${nama}`
  }

  /**
   * Kalimat keadaan, bukan kalimat perintah: kendalinya mencerminkan keadaan
   * sekarang, jadi yang perlu dibaca admin adalah "akan menjadi seperti apa",
   * termasuk ketika sebagiannya memang tidak ia ubah.
   */
  const ringkasan = () => {
    // Hanya dipanggil saat ada yang dicentang: tanpa centang, barisnya memang
    // tidak ditampilkan sama sekali.
    const jumlah = selectedVisible.length
    const bagian = [frasaKategori(), frasaAkses()].filter((frasa): frasa is string => Boolean(frasa))
    if (bagian.length === 0) {
      return isId
        ? `${jumlah} dokumen terpilih punya kategori dan akses yang berbeda-beda. Pilih yang baru di bawah untuk menyeragamkannya.`
        : `The ${jumlah} selected documents differ in both category and access. Choose new ones below to make them match.`
    }
    return isId
      ? `${jumlah} dokumen terpilih akan ${bagian.join(' dan ')}.`
      : `${jumlah} selected ${jumlah === 1 ? 'document' : 'documents'} will be ${bagian.join(' and ')}.`
  }

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
                    {/* Kategorinya dibaca dari categoryId, bukan dari teks
                        collection: dokumen yang kategorinya dilepas masih
                        menyimpan nama lama di kolom itu. */}
                    <FolderOpen size={11} />
                    {document.categoryId
                      ? document.collection
                      : (isId ? 'Tanpa kategori' : 'No category')}
                    <span className="doc-access-sep">·</span>
                    {document.unitKerja
                      ? <><Building2 size={11} /> {document.unitKerja.name}</>
                      : <><Globe2 size={11} /> {isId ? 'Terbuka untuk semua pegawai' : 'Open to every employee'}</>}
                  </small>
                </div>
              </div>
            ))}
          </div>

          {(bulkError || selectedVisible.length > 0) && (
            <p
              className={bulkError ? 'doc-access-error doc-access-foot' : 'field-hint doc-access-foot'}
              role={bulkError ? 'alert' : undefined}
            >
              {bulkError ?? ringkasan()}
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
            <span title={isId ? 'Hanya dokumen yang sedang tampil di daftar ini' : 'Only the documents currently shown in this list'}>
              {isId
                ? `Pilih semua (${filtered.length})`
                : `Select all (${filtered.length})`}
            </span>
          </label>

          {/* Kedua kotak tidak berlabel: isinya sendiri sudah menyebutkan
              keadaan dokumen yang dicentang. Baris BULK_KEEP cuma muncul kalau
              tidak ada satu nilai yang mewakili — belum ada yang dicentang,
              atau yang dicentang beragam — dan di situlah namanya disebut. */}
          <div className="doc-access-bulk">
            <div className="select-wrapper">
              <select
                value={bulkCategoryId}
                onChange={(event) => setBulkCategoryId(event.target.value)}
                disabled={busy || selectedVisible.length === 0}
                aria-label={isId ? 'Kategori untuk dokumen terpilih' : 'Category for selected documents'}
              >
                {bulkCategoryId === BULK_KEEP && (
                  <option value={BULK_KEEP}>
                    {selectedVisible.length === 0
                      ? (isId ? '— Kategori —' : '— Category —')
                      : (isId ? '— Kategori beragam —' : '— Mixed categories —')}
                  </option>
                )}
                <option value={BULK_NONE}>{isId ? 'Tanpa kategori' : 'No category'}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            <div className="select-wrapper">
              <select
                value={bulkUnitId}
                onChange={(event) => setBulkUnitId(event.target.value)}
                disabled={busy || selectedVisible.length === 0}
                aria-label={isId ? 'Akses untuk dokumen terpilih' : 'Access for selected documents'}
              >
                {bulkUnitId === BULK_KEEP && (
                  <option value={BULK_KEEP}>
                    {selectedVisible.length === 0
                      ? (isId ? '— Akses —' : '— Access —')
                      : (isId ? '— Akses beragam —' : '— Mixed access —')}
                  </option>
                )}
                <option value={BULK_NONE}>{isId ? 'Terbuka untuk semua' : 'Open to everyone'}</option>
                {unitKerjaList.map((unit) => (
                  <option key={unit.id} value={unit.id}>{isId ? `Kunci: ${unit.name}` : `Lock: ${unit.name}`}</option>
                ))}
              </select>
            </div>

            <button
              className="primary-button doc-access-apply"
              onClick={applyBulk}
              disabled={busy || selectedVisible.length === 0 || !adaPerubahan}
            >
              {bulkSaving
                ? <><Loader2 size={15} className="spin" /> {isId ? 'Menyimpan…' : 'Saving…'}</>
                : selectedVisible.length === 0
                  ? (isId ? 'Terapkan' : 'Apply')
                  : (isId
                      ? `Terapkan (${selectedVisible.length})`
                      : `Apply (${selectedVisible.length})`)}
            </button>
          </div>

          <button className="secondary-button" onClick={onClose} disabled={busy}>
            {isId ? 'Tutup' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
