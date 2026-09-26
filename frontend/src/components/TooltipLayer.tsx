import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Pengganti tooltip bawaan browser, yang tampilannya tidak bisa diatur. Semua
// elemen yang memakai atribut `title` otomatis ikut; tidak perlu komponen khusus.
//
// Caranya: selama kursor (atau fokus keyboard) ada di sebuah elemen, `title`-nya
// dilepas sementara supaya browser tidak sempat memunculkan tooltip native, lalu
// dipasang lagi begitu kursor pergi. `title` sengaja tidak dicabut permanen:
// ia juga nama elemen bagi pembaca layar, dan React tetap harus bisa mengubah
// atau menghapusnya (mis. `title={collapsed ? label : undefined}` di sidebar).
//
// Tooltip dirender lewat portal ke <body> supaya tidak terpotong tabel atau
// kartu yang memakai overflow hidden.
const SHOW_DELAY = 300
const GAP = 6
const EDGE = 8

type Tip = { text: string; target: HTMLElement }

function titledElement(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  const el = node.closest<HTMLElement>('[title]')
  // Title pada iframe adalah nama bingkainya, bukan tooltip.
  return el instanceof HTMLIFrameElement ? null : el
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer: number | undefined
    let current: { el: HTMLElement; text: string } | null = null

    // Kalau React memasang `title` baru saat elemennya masih dipegang, ambil
    // lagi — kalau dibiarkan, tooltip native-nya muncul.
    const watcher = new MutationObserver(() => {
      if (!current) return
      const text = current.el.getAttribute('title')
      if (text === null) return
      current.el.removeAttribute('title')
      current.text = text
      setTip((shown) => (shown ? { text, target: shown.target } : shown))
    })

    const hideBubble = () => {
      window.clearTimeout(timer)
      setTip(null)
    }
    const release = () => {
      hideBubble()
      watcher.disconnect()
      if (current && !current.el.hasAttribute('title')) current.el.setAttribute('title', current.text)
      current = null
    }
    const claim = (el: HTMLElement, delay: number) => {
      if (current?.el === el) return
      release()
      const text = el.getAttribute('title')
      if (!text) return
      el.removeAttribute('title')
      current = { el, text }
      watcher.observe(el, { attributes: true, attributeFilter: ['title'] })
      timer = window.setTimeout(() => { if (current) setTip({ text: current.text, target: current.el }) }, delay)
    }

    const onOver = (event: PointerEvent) => {
      // Layar sentuh tidak punya hover; browser pun tidak memunculkan title di sana.
      if (event.pointerType === 'touch') return
      const el = titledElement(event.target)
      // Elemen yang sedang dipegang sudah tidak punya `title`, jadi pindah ke ikon
      // di dalamnya akan menemukan leluhur di luar — tetap pegang yang sekarang,
      // kecuali anak itu punya `title` sendiri.
      if (current && event.target instanceof Node && current.el.contains(event.target)
        && !(el && el !== current.el && current.el.contains(el))) return
      if (el) claim(el, SHOW_DELAY)
      else release()
    }
    const onFocusIn = (event: FocusEvent) => {
      const el = titledElement(event.target)
      // Hanya fokus dari keyboard; fokus karena klik sudah ditangani pointerover.
      if (el && el.matches(':focus-visible')) claim(el, 0)
    }
    const onFocusOut = (event: FocusEvent) => {
      if (current && event.target === current.el && !current.el.matches(':hover')) release()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideBubble()
    }

    // Klik dan scroll hanya menutup gelembungnya. `title` baru dikembalikan saat
    // kursor meninggalkan elemen; kalau dikembalikan selagi kursor masih di atas,
    // tooltip native justru muncul.
    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerdown', hideBubble)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKey)
    document.documentElement.addEventListener('pointerleave', release)
    window.addEventListener('scroll', hideBubble, true)
    window.addEventListener('resize', hideBubble)
    window.addEventListener('blur', release)
    return () => {
      release()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerdown', hideBubble)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKey)
      document.documentElement.removeEventListener('pointerleave', release)
      window.removeEventListener('scroll', hideBubble, true)
      window.removeEventListener('resize', hideBubble)
      window.removeEventListener('blur', release)
    }
  }, [])

  useLayoutEffect(() => {
    if (!tip || !bubbleRef.current) { setPos(null); return }
    const anchor = tip.target.getBoundingClientRect()
    const bubble = bubbleRef.current.getBoundingClientRect()
    const below = anchor.top - bubble.height - GAP < EDGE
    const top = below ? anchor.bottom + GAP : anchor.top - bubble.height - GAP
    const centered = anchor.left + anchor.width / 2 - bubble.width / 2
    const left = Math.min(Math.max(centered, EDGE), window.innerWidth - bubble.width - EDGE)
    setPos({ top, left })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={bubbleRef}
      role="tooltip"
      className={`app-tooltip${pos ? ' visible' : ''}`}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
    >
      {tip.text}
    </div>,
    document.body,
  )
}
