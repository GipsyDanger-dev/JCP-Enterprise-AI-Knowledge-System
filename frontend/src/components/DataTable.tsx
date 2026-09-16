import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Pembungkus `.data-table` yang menambahkan scrollbar horizontal kembar di atas
 * tabel. Scrollbar bawaan container menempel di dasar tabel, jadi pada daftar
 * yang panjang user harus menggulir halaman sampai bawah dulu hanya untuk
 * menggeser kolom. Rel atas ini digerakkan dua arah dengan tabelnya.
 *
 * Rel hanya dirender kalau tabelnya memang melebar; kalau muat, tidak ada
 * garis nyangkut di atas tabel.
 */
export function DataTable({ children }: { children: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const [scrollWidth, setScrollWidth] = useState(0)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const measure = () => {
      setScrollWidth(body.scrollWidth)
      setOverflowing(body.scrollWidth - body.clientWidth > 1)
    }
    measure()
    // Tabel ikut diamati supaya lebar rel menyesuaikan saat baris difilter
    // atau kolom berubah lebar, bukan cuma saat jendela di-resize.
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    if (body.firstElementChild) observer.observe(body.firstElementChild)
    return () => observer.disconnect()
  }, [])

  // Rel baru dirender setelah tabelnya melebar, jadi posisinya disamakan dulu
  // supaya tidak lompat ke kiri kalau tabel sudah terlanjur digeser.
  useEffect(() => {
    if (!overflowing) return
    const body = bodyRef.current
    const rail = railRef.current
    if (body && rail) rail.scrollLeft = body.scrollLeft
  }, [overflowing])

  // Menyetel scrollLeft ke nilai yang sama tidak memicu event scroll lagi,
  // jadi pantulan antar kedua elemen berhenti sendiri tanpa perlu flag.
  const mirror = (from: 'body' | 'rail') => () => {
    const body = bodyRef.current
    const rail = railRef.current
    if (!body || !rail) return
    if (from === 'body') rail.scrollLeft = body.scrollLeft
    else body.scrollLeft = rail.scrollLeft
  }

  return (
    <div className="data-table-wrap">
      {overflowing && (
        <div className="data-table-rail" ref={railRef} onScroll={mirror('rail')} aria-hidden="true">
          <div style={{ width: scrollWidth }} />
        </div>
      )}
      <div className="data-table" ref={bodyRef} onScroll={mirror('body')}>{children}</div>
    </div>
  )
}
