import { useEffect, useRef } from 'react'

/** Sisa jarak di atas pesan galat supaya tidak menempel ke tepi kotak. */
const MARGIN = 12

/** Kotak terdekat yang benar-benar bisa digulir; null kalau semuanya pas. */
function scrollableParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement
  while (el) {
    const { overflowY } = getComputedStyle(el)
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el
    el = el.parentElement
  }
  return null
}

/**
 * Membawa pesan galat ke dalam pandangan setiap kali ia muncul.
 *
 * Dialog seperti "Buat akun" lebih tinggi dari layar, jadi pengguna biasanya
 * sudah menggulir ke bawah ketika menekan tombol simpan. Tanpa ini, galat yang
 * tampil di puncak dialog tidak terlihat dan formulir seolah-olah diam saja.
 *
 * Pemanggilnya selalu mengosongkan galat sebelum mengirim ulang, jadi nilai
 * yang sama dua kali berturut-turut tetap memicu gulir.
 */
export function useScrollToError<T extends HTMLElement = HTMLDivElement>(error: unknown) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const node = ref.current
    if (!error || !node) return
    const scroller = scrollableParent(node)
    if (!scroller) {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      return
    }
    const offset = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + offset - MARGIN), behavior: 'smooth' })
  }, [error])

  return ref
}
