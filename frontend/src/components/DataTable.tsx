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
  const wrapRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const [railWidth, setRailWidth] = useState(0)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const wrap = wrapRef.current
    const body = bodyRef.current
    if (!wrap || !body) return
    const measure = () => {
      // `.data-table` punya border 1px dan relnya tidak, jadi lebar-dalam
      // keduanya beda 2px. Kalau spacer dibuat sama persis dengan scrollWidth
      // tabel, scrollLeft maksimum rel jadi 2px lebih pendek: begitu tabel
      // mentok, nilai yang dioper ke rel dipangkas browser dan rel menyeret
      // tabel mundur lagi — tarik-menarik tepat di ujung. Spacer dilebihkan
      // sebesar selisih itu supaya jangkauan keduanya identik. Diukur, bukan
      // dipatok 2px, supaya ikut benar kalau border atau padangnya berubah.
      const relBox = railRef.current ?? wrap
      const selisih = relBox.clientWidth - body.clientWidth
      setRailWidth(body.scrollWidth + selisih)
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

  // Menyetel scrollLeft memicu event scroll di elemen tujuan, dan event itu
  // memantul balik ke sini. Event scroll dikirim asinkron, jadi penanda tidak
  // bisa dilepas tepat setelah penyetelan — dilepas di frame berikutnya.
  // Selama satu sisi masih menggerakkan yang lain, gema dari seberang diabaikan.
  const penggerak = useRef<'body' | 'rail' | null>(null)
  const lepas = useRef(0)
  const mirror = (dari: 'body' | 'rail') => () => {
    const body = bodyRef.current
    const rail = railRef.current
    if (!body || !rail) return
    if (penggerak.current && penggerak.current !== dari) return
    penggerak.current = dari
    const [asal, tujuan] = dari === 'body' ? [body, rail] : [rail, body]
    tujuan.scrollLeft = asal.scrollLeft
    cancelAnimationFrame(lepas.current)
    lepas.current = requestAnimationFrame(() => { penggerak.current = null })
  }

  useEffect(() => () => cancelAnimationFrame(lepas.current), [])

  return (
    <div className="data-table-wrap" ref={wrapRef}>
      {overflowing && (
        <div className="data-table-rail" ref={railRef} onScroll={mirror('rail')} aria-hidden="true">
          <div style={{ width: railWidth }} />
        </div>
      )}
      <div className="data-table" ref={bodyRef} onScroll={mirror('body')}>{children}</div>
    </div>
  )
}
