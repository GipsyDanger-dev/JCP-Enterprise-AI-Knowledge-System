import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

/**
 * Pembungkus `.data-table` yang menambahkan thumb horizontal di atas tabel.
 * Native scrollbar macOS dapat disembunyikan sistem, sehingga kontrol ini
 * digambar sendiri dan selalu tersedia saat tabel melebar.
 *
 * Rel hanya dirender kalau tabelnya memang melebar; kalau muat, tidak ada
 * garis nyangkut di atas tabel.
 */
export function DataTable({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef(0)
  const tableId = useId()
  const [overflowing, setOverflowing] = useState(false)
  const [scroll, setScroll] = useState({ left: 0, clientWidth: 0, scrollWidth: 0, trackWidth: 0 })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const wrap = wrapRef.current
    const body = bodyRef.current
    if (!wrap || !body) return
    const measure = () => {
      const trackWidth = trackRef.current?.clientWidth ?? wrap.clientWidth
      setScroll((current) => ({
        left: body.scrollLeft,
        clientWidth: body.clientWidth,
        scrollWidth: body.scrollWidth,
        trackWidth: trackWidth || current.trackWidth,
      }))
      setOverflowing(body.scrollWidth - body.clientWidth > 1)
    }
    measure()
    // Tabel ikut diamati supaya lebar rel menyesuaikan saat baris difilter
    // atau kolom berubah lebar, bukan cuma saat jendela di-resize.
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    if (body.firstElementChild) observer.observe(body.firstElementChild)
    if (trackRef.current) observer.observe(trackRef.current)
    return () => observer.disconnect()
  }, [overflowing])

  const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth)
  const thumbWidth = maxScroll > 0
    ? Math.max(44, (scroll.clientWidth / scroll.scrollWidth) * scroll.trackWidth)
    : scroll.trackWidth
  const thumbOffset = maxScroll > 0
    ? (scroll.left / maxScroll) * Math.max(0, scroll.trackWidth - thumbWidth)
    : 0

  const updateScroll = (left: number) => {
    const body = bodyRef.current
    if (!body) return
    body.scrollLeft = Math.max(0, Math.min(left, maxScroll))
    setScroll((current) => ({ ...current, left: body.scrollLeft }))
  }

  const scrollFromPointer = (clientX: number, offset: number) => {
    const track = trackRef.current
    if (!track || maxScroll === 0) return
    const position = Math.max(0, Math.min(
      clientX - track.getBoundingClientRect().left - offset,
      Math.max(0, scroll.trackWidth - thumbWidth),
    ))
    updateScroll((position / Math.max(1, scroll.trackWidth - thumbWidth)) * maxScroll)
  }

  const onBodyScroll = () => {
    const body = bodyRef.current
    if (body) setScroll((current) => ({ ...current, left: body.scrollLeft }))
  }

  const onTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragOffset.current = thumbWidth / 2
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    scrollFromPointer(event.clientX, dragOffset.current)
  }

  const onThumbPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const track = trackRef.current
    if (!track) return
    dragOffset.current = event.clientX - track.getBoundingClientRect().left - thumbOffset
    track.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const onTrackPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging) scrollFromPointer(event.clientX, dragOffset.current)
  }

  const onTrackPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
  }

  const onTrackKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = Math.max(40, scroll.clientWidth * 0.15)
    if (event.key === 'ArrowLeft') updateScroll(scroll.left - step)
    else if (event.key === 'ArrowRight') updateScroll(scroll.left + step)
    else if (event.key === 'Home') updateScroll(0)
    else if (event.key === 'End') updateScroll(maxScroll)
    else return
    event.preventDefault()
  }

  return (
    <div className="data-table-wrap" ref={wrapRef}>
      {overflowing && (
        <div
          ref={trackRef}
          className={`data-table-rail${dragging ? ' is-dragging' : ''}`}
          role="scrollbar"
          tabIndex={0}
          aria-label="Geser kolom tabel"
          aria-controls={tableId}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={maxScroll}
          aria-valuenow={scroll.left}
          onKeyDown={onTrackKeyDown}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerEnd}
          onPointerCancel={onTrackPointerEnd}
        >
          <div
            className="data-table-thumb"
            style={{ width: thumbWidth, transform: `translateX(${thumbOffset}px)` }}
            onPointerDown={onThumbPointerDown}
          />
        </div>
      )}
      <div id={tableId} className="data-table" ref={bodyRef} onScroll={onBodyScroll}>{children}</div>
    </div>
  )
}
