import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, Clock, FolderOpen, Library, Megaphone, MessageSquareText, PanelLeft, Sparkles, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

interface Slide {
  icon: LucideIcon
  tone: 'brand' | 'mint' | 'violet' | 'warning'
  title: string
  body: string
  points?: string[]
}

/** Geseran sejauh ini (dalam piksel) sudah dianggap niat pindah slide. */
const SWIPE_THRESHOLD = 50

function useSlides(): Slide[] {
  const { user } = useAuth()
  const { language, navigation, role } = useWorkspace()
  const isId = language === 'id'
  const isPersonal = user?.accountType === 'PERSONAL'
  const isAdmin = role === 'admin'
  const label = (id: string) => navigation.find((item) => item.id === id)?.label ?? id

  const slides: Slide[] = [
    {
      icon: Sparkles,
      tone: 'brand',
      title: isId ? 'Selamat datang di Enterprise AI' : 'Welcome to Enterprise AI',
      body: isPersonal
        ? (isId ? 'Unggah dokumen Anda, lalu tanyakan isinya ke AI. Setiap jawaban disertai sumbernya supaya bisa Anda periksa sendiri.' : 'Upload your documents, then ask the AI about them. Every answer comes with its sources so you can check them yourself.')
        : (isId ? 'Tanyakan apa saja tentang dokumen perusahaan dan dapatkan jawaban lengkap dengan sumbernya. Geser untuk melihat cara pakainya.' : 'Ask anything about company documents and get answers with their sources. Swipe to see how it works.'),
    },
    {
      icon: PanelLeft,
      tone: 'violet',
      title: isId ? 'Semua menu ada di sisi kiri' : 'Everything lives in the sidebar',
      body: isId
        ? 'Buka halaman mana pun dari sidebar. Tombol « menciutkannya; di ponsel, sidebar dibuka lewat tombol menu di pojok kiri atas.'
        : 'Open any page from the sidebar. The « button collapses it; on a phone, open it with the menu button in the top-left corner.',
      points: navigation.map((item) => item.label),
    },
    {
      icon: MessageSquareText,
      tone: 'brand',
      title: isId ? 'Tanyakan ke AI' : 'Ask the AI',
      body: isId
        ? `Buka ${label('chat')} dan ketik pertanyaan dengan bahasa sehari-hari. AI hanya menjawab dari dokumen yang boleh Anda lihat.`
        : `Open ${label('chat')} and type your question in plain words. The AI only answers from documents you are allowed to see.`,
      points: isId
        ? ['Setiap jawaban mencantumkan dokumen, halaman, dan bagian sumbernya.', 'Klik sumbernya untuk membaca isi aslinya.', 'Jawaban "tidak ditemukan"? Coba kata kunci lain atau rumuskan ulang.']
        : ['Every answer lists the source document, page, and section.', 'Click a source to read the original text.', 'Got "not found"? Try other keywords or rephrase the question.'],
    },
  ]

  if (isAdmin || isPersonal) {
    slides.push({
      icon: FolderOpen,
      tone: 'mint',
      title: isId ? 'Unggah dokumen' : 'Upload documents',
      body: isId
        ? `Di ${label('documents')}, klik Unggah dokumen lalu pilih file PDF atau DOCX. Sistem membaca dan mengindeksnya otomatis.`
        : `In ${label('documents')}, click Upload document and pick a PDF or DOCX file. The system reads and indexes it automatically.`,
      points: isPersonal
        ? (isId
            ? ['Kelompokkan dokumen dengan Kelola kategori.', 'Dokumen berstatus Ready sudah bisa ditanyakan ke AI.', 'Dokumen di ruang pribadi hanya bisa dilihat oleh Anda.']
            : ['Group documents with Manage categories.', 'Documents marked Ready can be asked about.', 'Documents in a personal workspace are visible only to you.'])
        : (isId
            ? ['Kelompokkan dokumen dengan Kelola kategori.', 'Atur unit kerja yang boleh membaca dokumen lewat Manajemen dokumen.', 'Dokumen berstatus Ready sudah bisa ditanyakan ke AI.']
            : ['Group documents with Manage categories.', 'Choose which work units can read a document in Document management.', 'Documents marked Ready can be asked about.']),
    })
  } else {
    slides.push({
      icon: Library,
      tone: 'mint',
      title: isId ? 'Jelajahi perpustakaan' : 'Browse the library',
      body: isId
        ? `${label('documents')} berisi semua dokumen yang dibagikan ke unit kerja Anda.`
        : `${label('documents')} holds every document shared with your work unit.`,
      points: isId
        ? ['Dokumen berstatus Ready sudah bisa ditanyakan ke AI.', 'Jika jabatan Anda diizinkan mengunggah, tombol Unggah dokumen muncul di sana.']
        : ['Documents marked Ready can be asked about.', 'If your position is allowed to upload, an Upload document button appears there.'],
    })
  }

  if (isAdmin) {
    slides.push({
      icon: Users,
      tone: 'warning',
      title: isId ? 'Kelola orang dan akses' : 'Manage people and access',
      body: isId
        ? `Tambahkan akun karyawan dan atur unit kerja serta jabatannya di ${label('users')}.`
        : `Add employee accounts and set their work unit and position in ${label('users')}.`,
      points: isId
        ? [`Kirim kabar ke semua orang lewat ${label('announcements')}.`, 'Balas pertanyaan karyawan di Kotak masuk.', 'Pantau siapa melakukan apa di Log aktivitas.']
        : [`Send news to everyone through ${label('announcements')}.`, 'Reply to employees in the Inbox.', 'See who did what in the Activity log.'],
    })
  } else if (!isPersonal) {
    slides.push({
      icon: Megaphone,
      tone: 'warning',
      title: isId ? 'Pengumuman dan pesan' : 'Announcements and messages',
      body: isId
        ? `Kabar dari admin muncul di ${label('announcements')}; angka di sidebar menandakan yang belum dibaca.`
        : `News from admins shows up in ${label('announcements')}; the number in the sidebar counts unread ones.`,
      points: isId
        ? ['Ada kendala atau dokumen yang kurang? Hubungi admin lewat Pesan ke admin.']
        : ['Something missing or not working? Reach an admin through Message admin.'],
    })
  }

  slides.push({
    icon: Clock,
    tone: 'violet',
    title: isId ? 'Riwayat dan pengaturan' : 'History and settings',
    body: isId
      ? 'Percakapan sebelumnya tersimpan di Riwayat chat, jadi Anda bisa melanjutkannya kapan saja.'
      : 'Past conversations are kept in Chat history, so you can pick them up any time.',
    points: isId
      ? ['Ganti tema, ukuran huruf, dan bahasa di Pengaturan.', 'Tutorial ini bisa dibuka lagi dari Pengaturan.']
      : ['Change the theme, font size, and language in Settings.', 'You can reopen this tutorial from Settings.'],
  })

  return slides
}

export function TutorialModal({ onClose, offerDontShowAgain = false }: {
  /** Dipanggil saat tutorial ditutup; `dontShowAgain` true bila kotaknya dicentang. */
  onClose: (dontShowAgain: boolean) => void
  /** Tampilkan kotak "jangan tampilkan lagi" — hanya untuk tutorial yang muncul sendiri. */
  offerDontShowAgain?: boolean
}) {
  const { language } = useWorkspace()
  const isId = language === 'id'
  const slides = useSlides()
  const titleId = useId()
  const [index, setIndex] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const drag = useRef<{ startX: number; startY: number; lastX: number; pointerId: number; horizontal: boolean | null } | null>(null)

  const last = slides.length - 1
  const current = Math.min(index, last)
  const goTo = useCallback((next: number) => setIndex(Math.max(0, Math.min(last, next))), [last])
  const close = useCallback(() => onClose(dontShowAgain), [onClose, dontShowAgain])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowRight') goTo(current + 1)
      else if (event.key === 'ArrowLeft') goTo(current - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, goTo, current])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    drag.current = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, pointerId: event.pointerId, horizontal: null }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    state.lastX = event.clientX
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    // Arah geseran ditentukan sekali di awal: geseran yang lebih tegak dari
    // mendatar dibiarkan menggulir isi slide, bukan memindah slide.
    if (state.horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      state.horizontal = Math.abs(dx) > Math.abs(dy)
      if (state.horizontal) event.currentTarget.setPointerCapture(event.pointerId)
    }
    if (!state.horizontal) return
    // Di ujung deretan, geserannya diperlambat supaya terasa "mentok".
    const atEdge = (current === 0 && dx > 0) || (current === last && dx < 0)
    setDragOffset(atEdge ? dx / 3 : dx)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    drag.current = null
    if (state.horizontal) {
      // Posisi dari pointermove terakhir, bukan dari event ini: pointerup hasil
      // sentuhan tidak selalu membawa koordinat yang benar.
      const dx = state.lastX - state.startX
      if (dx <= -SWIPE_THRESHOLD) goTo(current + 1)
      else if (dx >= SWIPE_THRESHOLD) goTo(current - 1)
    }
    setDragOffset(0)
  }

  return (
    <div className="modal-overlay tutorial-overlay">
      <div className="modal-card tutorial-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="tutorial-topbar">
          <span className="tutorial-step">{isId ? `Langkah ${current + 1} dari ${slides.length}` : `Step ${current + 1} of ${slides.length}`}</span>
          <button type="button" className="icon-button" aria-label={isId ? 'Tutup tutorial' : 'Close tutorial'} onClick={close}>
            <X size={18} />
          </button>
        </div>

        <div
          className="tutorial-viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className={['tutorial-track', dragOffset !== 0 ? 'dragging' : ''].filter(Boolean).join(' ')}
            style={{ transform: `translateX(calc(${-current * 100}% + ${dragOffset}px))` }}
          >
            {slides.map((slide, slideIndex) => {
              const Icon = slide.icon
              const active = slideIndex === current
              return (
                <section key={slide.title} className="tutorial-slide" aria-hidden={!active} inert={!active}>
                  <div className={`tutorial-illustration ${slide.tone}`}>
                    <span className="tutorial-icon"><Icon size={34} strokeWidth={1.8} /></span>
                  </div>
                  <h2 id={active ? titleId : undefined}>{slide.title}</h2>
                  <p>{slide.body}</p>
                  {slide.points && slide.points.length > 0 && (
                    <ul className="tutorial-points">
                      {slide.points.map((point) => <li key={point}>{point}</li>)}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        </div>

        <div className="tutorial-dots" role="tablist" aria-label={isId ? 'Pilih langkah' : 'Choose step'}>
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.title}
              type="button"
              role="tab"
              aria-selected={slideIndex === current}
              aria-label={isId ? `Langkah ${slideIndex + 1}` : `Step ${slideIndex + 1}`}
              className={slideIndex === current ? 'active' : undefined}
              onClick={() => goTo(slideIndex)}
            />
          ))}
        </div>

        <div className="modal-actions tutorial-actions">
          {offerDontShowAgain && (
            <label className="tutorial-dont-show">
              <input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)} />
              <span>{isId ? 'Jangan tampilkan lagi' : "Don't show this again"}</span>
            </label>
          )}
          <div className="tutorial-nav">
            {current > 0 && (
              <button type="button" className="secondary-button" onClick={() => goTo(current - 1)}>
                <ChevronLeft size={16} /> {isId ? 'Kembali' : 'Back'}
              </button>
            )}
            {current < last ? (
              <button type="button" className="primary-button" onClick={() => goTo(current + 1)}>
                {isId ? 'Lanjut' : 'Next'} <ChevronRight size={16} />
              </button>
            ) : (
              <button type="button" className="primary-button" onClick={close}>
                {isId ? 'Mulai' : 'Get started'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
