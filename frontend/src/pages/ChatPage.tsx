import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowUpRight, FileText, Loader2, Maximize2, MessageSquareText, Minimize2, Plus, Send, ShieldCheck, Sparkles, Timer, X } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { SourceCard } from '@/components/SourceCard'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { getDocumentBlob, getDocumentChunks } from '@/api/documents'
import type { DocumentChunk } from '@/api/documents'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { quickQuestions } from '@/types/domain'
import { legalStatusLabel } from '@/utils/legalStatus'
import type { ChatMessage } from '@/context/workspaceContextValue'

type Citation = ChatMessage['citations'][number]

/**
 * Status yang membuat sebuah kutipan perlu diperingatkan.
 *
 * RANCANGAN tidak masuk: dokumen berstatus itu tidak pernah sampai ke jawaban
 * sama sekali, disaring jauh sebelum di sini. Yang tersisa justru dua yang
 * TETAP dikutip — dan karena tetap dikutip, statusnya harus terbaca.
 */
const STATUS_PERLU_PERINGATAN = new Set(['DIUBAH', 'DICABUT'])

const perluPeringatan = (citation: Citation) =>
  STATUS_PERLU_PERINGATAN.has(citation.legalStatus ?? 'BERLAKU')

/**
 * Peringatan bahwa jawaban di atasnya bersandar pada peraturan yang sudah tidak
 * utuh berlaku.
 *
 * Disusun antarmuka dari sitasinya, bukan diminta dari model: model diberi tahu
 * statusnya dan biasanya menyebutkannya, tapi "biasanya" tidak cukup untuk hal
 * yang menentukan apakah pembacanya salah menerapkan aturan. Ini selalu muncul.
 *
 * Statusnya juga selalu yang terkini — backend membacanya ulang setiap kali,
 * jadi jawaban lama di riwayat ikut berubah peringatannya begitu peraturannya
 * dicabut.
 */
function LegalStatusNotice({ citations, isId }: { citations: Citation[]; isId: boolean }) {
  const bermasalah = citations.filter(perluPeringatan)
  if (bermasalah.length === 0) return null

  // Satu dokumen bisa menyumbang beberapa kutipan; yang disebut cukup namanya
  // sekali, kalau tidak peringatannya jadi daftar berulang.
  const perDokumen = new Map<string, { nama: string; status: string }>()
  for (const citation of bermasalah) {
    if (perDokumen.has(citation.documentId)) continue
    perDokumen.set(citation.documentId, {
      nama: citation.title || citation.filename,
      status: legalStatusLabel(citation.legalStatus ?? 'BERLAKU', isId).toLowerCase(),
    })
  }

  return (
    <div className="legal-status-notice" role="status">
      <AlertTriangle size={16} />
      <div>
        <strong>{isId ? 'Perhatikan status sumbernya' : 'Mind the source status'}</strong>
        <ul>
          {[...perDokumen.values()].map((dokumen) => (
            <li key={dokumen.nama}>
              {isId
                ? <>Dokumen <b>{dokumen.nama}</b> sudah <b>{dokumen.status}</b>, jadi isinya belum tentu masih berlaku.</>
                : <>Document <b>{dokumen.nama}</b> is <b>{dokumen.status}</b>, so its content may no longer apply.</>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const COMMON_QUERY_WORDS = new Set(['yang', 'dengan', 'untuk', 'dalam', 'tentang', 'pada', 'dari', 'atau', 'dan', 'saya', 'kami', 'bisa', 'bagaimana', 'berapa', 'apakah', 'tolong', 'dokumen', 'perusahaan'])
const NO_ANSWER_TEXT = 'Informasi tidak ditemukan pada dokumen yang tersedia.'
/**
 * Sedikit lebih lama daripada --ease-panel di CSS, supaya pemuatan ulang PDF
 * jatuh setelah panelnya benar-benar berhenti bergerak.
 */
const JEDA_MUAT_ULANG_PDF = 280

function formatEvidencePreview(excerpt: string, question: string | null) {
  const normalized = excerpt
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const firstSection = normalized.search(/\b1\.\s+[A-Z][A-Z\s]{2,}(?=\s)/)
  const content = (firstSection >= 0 ? normalized.slice(firstSection) : normalized).trim()
  const sections = content
    .split(/(?=\b\d+\.\s+[A-Z][A-Z\s]{2,}(?=\s))/)
    .map((section) => section.trim())
    .filter(Boolean)
  const keywords = (question ?? '').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)?.filter((word) => !COMMON_QUERY_WORDS.has(word)) ?? []
  const ranked = sections
    .map((section, index) => ({
      section,
      index,
      score: keywords.reduce((score, word) => score + (section.toLowerCase().includes(word) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(2, sections.length))
    .map(({ section }) => section.length > 520 ? `${section.slice(0, 520).trimEnd()}...` : section)
  return (ranked.length > 0 ? ranked : [content.slice(0, 720)]).join('\n\n')
}

// Nama berkas hanya identitas teknis; yang dikenali pengguna adalah judul di
// daftar dokumen. Menampilkan nama berkas membuat dokumen yang sudah diganti
// nama tampil dengan nama lamanya di kartu bukti.
function documentLabel(citation: { title?: string; filename: string }): string {
  return citation.title?.trim() || citation.filename
}

/** Selang perbaruan penghitung — cukup halus untuk terbaca berjalan. */
const DETAK_PENGHITUNG = 100

function formatDurasi(ms: number, isId: boolean) {
  const detik = ms / 1000
  if (detik < 60) {
    const angka = detik.toFixed(1)
    return isId ? `${angka.replace('.', ',')} dtk` : `${angka}s`
  }
  const menit = Math.floor(detik / 60)
  const sisa = Math.round(detik % 60)
  return isId ? `${menit} mnt ${sisa} dtk` : `${menit}m ${sisa}s`
}

/**
 * Lama AI menjawab, berjalan selama jawabannya ditunggu lalu berhenti pada
 * angka terakhirnya.
 *
 * Dihitung dari `startedAt` setiap detak, bukan ditambah sendiri: tab yang
 * tidak aktif membuat interval melambat, dan penghitung yang menjumlah
 * detaknya sendiri akan tertinggal jauh dari waktu yang sebenarnya berlalu.
 *
 * Yang ditampilkan setelah selesai adalah `durationMs` dari provider, bukan
 * angka terakhir yang sempat terlihat — pesan yang dimuat dari riwayat tidak
 * membawanya, jadi di sana penghitungnya memang tidak muncul.
 */
function AnswerTimer({ startedAt, durationMs, isRunning, isId }: { startedAt: number; durationMs: number | null; isRunning: boolean; isId: boolean }) {
  const [berjalan, setBerjalan] = useState(() => Date.now() - startedAt)

  useEffect(() => {
    if (!isRunning) return
    setBerjalan(Date.now() - startedAt)
    const detak = window.setInterval(() => setBerjalan(Date.now() - startedAt), DETAK_PENGHITUNG)
    return () => window.clearInterval(detak)
  }, [isRunning, startedAt])

  const ms = isRunning ? berjalan : durationMs
  if (ms === null) return null

  return (
    <span
      className={`answer-timer ${isRunning ? 'is-running' : ''}`}
      // Dibaca sekali lewat title saja: pembacaan layar tidak perlu diberi tahu
      // ulang sepuluh kali sedetik bahwa angkanya bertambah.
      aria-live="off"
      title={isRunning
        ? (isId ? 'Waktu yang sudah berjalan' : 'Time elapsed so far')
        : (isId ? 'Lama AI menjawab' : 'Time the AI took to answer')}
    >
      <Timer size={13} /> {formatDurasi(Math.max(0, ms), isId)}
    </span>
  )
}

function ChatMessageItem({ msg, isId, isPending, onOpenSource, onSuggestion }: { msg: ChatMessage; isId: boolean; isPending: boolean; onOpenSource: (citation: Citation, question: string) => void; onSuggestion: (value: string) => void }) {
  return (
    <>
      <div className="user-message">{msg.question}</div>
      {isPending && !msg.answer && !msg.error && (
        <div className="assistant-message loading">
          <div className="answer-label"><Loader2 size={16} className="spin" /> Enterprise AI <AnswerTimer startedAt={msg.timestamp} durationMs={msg.durationMs} isRunning isId={isId} /></div>
          <p className="typing-indicator">{isId ? 'Mencari basis pengetahuan…' : 'Searching knowledge base…'}</p>
        </div>
      )}
      {!isPending && msg.error && !msg.answer && (
        <div className="assistant-message no-answer">
          <div className="answer-label"><AlertTriangle size={16} /> Enterprise AI <AnswerTimer startedAt={msg.timestamp} durationMs={msg.durationMs} isRunning={false} isId={isId} /></div>
          <p>{msg.error}</p>
          {msg.suggestions.length > 0 && <SuggestionList suggestions={msg.suggestions} onSelect={onSuggestion} />}
        </div>
      )}
      {msg.answer && (
        <div className="assistant-message">
          <div className="answer-label"><Sparkles size={16} /> Enterprise AI <AnswerTimer startedAt={msg.timestamp} durationMs={msg.durationMs} isRunning={false} isId={isId} /></div>
          <LegalStatusNotice citations={msg.citations} isId={isId} />
          <div className="answer-copy">{renderAnswer(msg.answer)}</div>
          {msg.suggestions.length > 0 && <SuggestionList suggestions={msg.suggestions} onSelect={onSuggestion} />}
          {msg.citations.length > 0 && (
            <div className="citations">
              <strong className="citations-label">{isId ? 'Bukti sumber' : 'Source evidence'}</strong>
              <div className="citations-track">
                {msg.citations.map((c, i) => (
                  <SourceCard
                    key={`${c.documentId}-${c.chunkId}-${i}`}
                    title={documentLabel(c)}
                    badge={perluPeringatan(c)
                      ? <span className={`source-legal-badge ${(c.legalStatus ?? '').toLowerCase()}`}>{legalStatusLabel(c.legalStatus ?? 'BERLAKU', isId)}</span>
                      : undefined}
                    detail={[c.sectionTitle, c.pageNumber ? `Page ${c.pageNumber}` : null, c.version].filter(Boolean).join(' · ')}
                    excerpt={c.excerpt}
                    trailing={<ArrowUpRight size={15} />}
                    onOpen={() => onOpenSource(c, msg.question)}
                  />
                ))}
              </div>
            </div>
          )}
          {/* Ikut syarat kartu sumber di atas: tanpa kutipan tidak ada bukti
              yang bisa diklaim terverifikasi. */}
          {msg.citations.length > 0 && <VerifiedBadge />}
        </div>
      )}
    </>
  )
}

function renderAnswer(answer: string) {
  if (answer.trim() === NO_ANSWER_TEXT) return <strong>{answer}</strong>

  return answer.split(/\r?\n/).map((line, lineIndex) => {
    const sourceLine = /^\s*\*{0,2}\(?\s*(?:sumber|source)\s*:/i.test(line)
    if (sourceLine) {
      const source = line.trim().replace(/^\*{1,2}\s*/, '').replace(/\s*\*{1,2}$/, '')
      return <div key={`${lineIndex}-${line}`}><strong>{source}</strong></div>
    }
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    return (
      <div key={`${lineIndex}-${line}`} className={line.trim() === '' ? 'answer-blank' : undefined}>
        {parts.map((part, partIndex) => part.startsWith('**') && part.endsWith('**')
          ? <strong key={partIndex}>{part.slice(2, -2)}</strong>
          : <span key={partIndex}>{part}</span>)}
      </div>
    )
  })
}

function SuggestionList({ suggestions, onSelect }: { suggestions: string[]; onSelect: (value: string) => void }) {
  return (
    <div className="chat-suggestions">
      <span>Coba tanyakan:</span>
      <div>
        {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => onSelect(suggestion)}>{suggestion}</button>)}
      </div>
    </div>
  )
}

export function ChatPage() {
  const { token } = useAuth()
  const { question, setQuestion, chatHistory, clearChat, isLoadingAnswer, awaitingChoice, onAsk, askQuestion, language, documents } = useWorkspace()
  const hasConversation = chatHistory.length > 0 || isLoadingAnswer
  const isId = language === 'id'
  const bottomRef = useRef<HTMLDivElement>(null)
  const [selectedSource, setSelectedSource] = useState<Citation | null>(null)
  const [selectedSourceQuestion, setSelectedSourceQuestion] = useState<string | null>(null)
  const [sourcePreviewText, setSourcePreviewText] = useState<string | null>(null)
  const [sourcePreviewLoading, setSourcePreviewLoading] = useState(false)
  const [sourcePdfUrl, setSourcePdfUrl] = useState<string | null>(null)
  const [sourcePdfLoading, setSourcePdfLoading] = useState(false)
  // Unduhan PDF-nya gagal. Dulu kegagalan ini ditelan diam-diam dan tampilannya
  // jatuh ke cuplikan teks, persis seperti dokumen yang memang bukan PDF — jadi
  // tidak ada cara membedakan "berkasnya tidak bisa diambil" dari "dokumen ini
  // tidak punya penampil".
  const [sourcePdfError, setSourcePdfError] = useState(false)
  // Seluruh isi dokumen non-PDF. Yang dikutip AI hanya satu potongan; tanpa ini
  // itulah satu-satunya yang bisa dilihat, dan sebuah .txt atau .docx tidak
  // pernah bisa dibaca utuh sebagai bukti.
  const [sourceChunks, setSourceChunks] = useState<DocumentChunk[] | null>(null)
  const potonganDikutipRef = useRef<HTMLDivElement>(null)
  const [sourceExpanded, setSourceExpanded] = useState(false)
  // PDF menghitung view=FitH sekali saja, saat dimuat, jadi setelah jendelanya
  // berganti ukuran halamannya tetap selebar jendela yang lama dan iframe-nya
  // perlu dimuat ulang. Dulu itu dilakukan lewat key yang ikut berubah bersama
  // sourceExpanded — artinya PDF-nya dimuat ulang tepat saat animasi dimulai,
  // dan yang terlihat sepanjang perpindahan adalah bingkai putih kosong.
  // Sekarang pemuatannya ditunda sampai ukurannya diam, jadi yang bergerak
  // hanya jendelanya, dengan halaman lama masih terbaca di dalamnya.
  const [pdfMuatUlang, setPdfMuatUlang] = useState(0)
  const ukuranSebelumnya = useRef(sourceExpanded)
  // Ukuran PDF selama jendelanya bergerak; null berarti sedang diam.
  const [pdfBeku, setPdfBeku] = useState<{ lebar: number; tinggi: number } | null>(null)
  const pdfKotakRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedSource) {
      setSourcePreviewText(null)
      setSourcePdfUrl(null)
      setSourcePdfError(false)
      setSourceChunks(null)
      setSelectedSourceQuestion(null)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    const isPdf = selectedSource.filename.toLowerCase().endsWith('.pdf')

    setSourcePdfUrl(null)
    setSourcePdfError(false)
    setSourceChunks(null)
    setSourcePreviewText(selectedSource.excerpt ?? null)
    const bersihkan = () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }

    if (isPdf) {
      setSourcePdfLoading(true)
      getDocumentBlob(selectedSource.documentId, token ?? undefined)
        .then((blob) => {
          objectUrl = URL.createObjectURL(blob)
          if (!cancelled) setSourcePdfUrl(objectUrl)
        })
        // Ditandai, bukan didiamkan: tanpa penanda ini kegagalan mengambil
        // berkasnya tampil sama persis seperti dokumen yang memang tidak punya
        // penampil, dan pembacanya mengira dokumennya yang kosong.
        .catch(() => { if (!cancelled) { setSourcePdfUrl(null); setSourcePdfError(true) } })
        .finally(() => { if (!cancelled) setSourcePdfLoading(false) })

      if (selectedSource.excerpt) return bersihkan
      // PDF yang sitasinya tidak membawa cuplikan: ambil potongan yang dikutip
      // saja, sebagai cadangan kalau berkasnya ternyata gagal diambil.
      setSourcePreviewLoading(true)
      getDocumentChunks(selectedSource.documentId, token ?? undefined)
        .then((result) => {
          if (!cancelled) {
            setSourcePreviewText(result.chunks.find((chunk) => chunk.chunkId === selectedSource.chunkId)?.text ?? null)
          }
        })
        .catch(() => { if (!cancelled) setSourcePreviewText(null) })
        .finally(() => { if (!cancelled) setSourcePreviewLoading(false) })
      return bersihkan
    }

    // Bukan PDF: tidak ada berkas yang bisa ditampilkan apa adanya, jadi
    // dokumennya disusun ulang dari seluruh potongan teksnya. Yang dikutip AI
    // tetap ditandai supaya buktinya bisa ditemukan tanpa membaca semuanya.
    setSourcePreviewLoading(true)
    getDocumentChunks(selectedSource.documentId, token ?? undefined)
      .then((result) => {
        if (cancelled) return
        setSourceChunks(result.chunks)
        if (!selectedSource.excerpt) {
          setSourcePreviewText(result.chunks.find((chunk) => chunk.chunkId === selectedSource.chunkId)?.text ?? null)
        }
      })
      .catch(() => { if (!cancelled) setSourceChunks(null) })
      .finally(() => { if (!cancelled) setSourcePreviewLoading(false) })
    return bersihkan
  }, [selectedSource, token])

  // Gulirkan ke potongan yang dikutip begitu dokumennya selesai disusun.
  useEffect(() => {
    if (!sourceChunks?.length) return
    potonganDikutipRef.current?.scrollIntoView({ block: 'center' })
  }, [sourceChunks])

  const evidencePreview = sourcePreviewText ? formatEvidencePreview(sourcePreviewText, selectedSourceQuestion) : null

  const sourcePdfSrc = sourcePdfUrl
    ? `${sourcePdfUrl}#page=${selectedSource?.pageNumber ?? 1}&view=FitH`
    : null

  useEffect(() => {
    // Hanya saat ukurannya benar-benar berubah: membuka pratinjau tidak boleh
    // ikut menjadwalkan pemuatan ulang untuk PDF yang baru saja tampil.
    if (ukuranSebelumnya.current === sourceExpanded) return
    ukuranSebelumnya.current = sourceExpanded
    const jeda = window.setTimeout(() => {
      setPdfBeku(null)
      setPdfMuatUlang((nilai) => nilai + 1)
    }, JEDA_MUAT_ULANG_PDF)
    return () => window.clearTimeout(jeda)
  }, [sourceExpanded])

  /**
   * Menukar ukuran jendela sambil mengunci PDF pada ukurannya yang sekarang.
   *
   * Melebarkan iframe-nya ikut, frame demi frame, berarti penampil PDF menata
   * ulang seluruh halaman puluhan kali sedetik — itu, bukan animasi bingkainya,
   * yang membuat perpindahan terasa tersendat. Selama bergerak ukurannya
   * dibekukan dan hanya dipotong oleh bingkai yang berubah; setelah diam
   * barulah dilepas, lalu dimuat ulang sekali untuk menyesuaikan lebar baru.
   */
  const ubahUkuranJendela = () => {
    const kotak = pdfKotakRef.current
    if (kotak) setPdfBeku({ lebar: kotak.clientWidth, tinggi: kotak.clientHeight })
    setSourceExpanded((value) => !value)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isLoadingAnswer])

  return (
    <div className="chat-page">
      <div className="chat-workspace-header">
        <PageHeading
          eyebrow={isId ? 'Asisten AI' : 'AI assistant'}
          title={isId ? 'Knowledge workspace' : 'Knowledge workspace'}
          detail={isId ? 'Jawaban berbasis dokumen perusahaan.' : 'Answers grounded in company documents.'}
          action={hasConversation ? (
            <button
              type="button"
              className="secondary-button"
              onClick={clearChat}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={15} /> {isId ? 'Chat baru' : 'New chat'}
            </button>
          ) : undefined}
        />
        <div className="chat-trust-status">
          <ShieldCheck size={16} />
          <span>{isId ? 'Sumber terverifikasi' : 'Verified sources'}</span>
        </div>
      </div>
      <div className={`chat-canvas ${hasConversation ? 'has-history' : ''}`}>
        {hasConversation ? (
          <div className="conversation">
            {chatHistory.map((msg, index) => (
              <ChatMessageItem key={msg.id} msg={msg} isId={isId} isPending={isLoadingAnswer && index === chatHistory.length - 1} onOpenSource={(citation, sourceQuestion) => { setSelectedSourceQuestion(sourceQuestion); setSelectedSource(citation) }} onSuggestion={askQuestion} />
            ))}

            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="chat-empty">
            <span><MessageSquareText size={24} /></span>
            <h2>{isId ? 'Apa yang ingin Anda ketahui?' : 'What would you like to know?'}</h2>
            <p>{isId ? 'Tanyakan tentang kebijakan, SOP, handbooks, dan dokumen internal.' : 'Ask across policies, SOPs, handbooks, and internal documents.'}</p>
            <div>{quickQuestions(language, documents).slice(0, 2).map((item) => (
              <button key={item} onClick={() => askQuestion(item)}>{item}</button>
            ))}</div>
          </div>
        )}
      </div>
      <form className="chat-composer" onSubmit={onAsk}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={awaitingChoice
            ? (isId ? 'Pilih pertanyaan di atas, atau tulis pertanyaan Anda sendiri' : 'Pick a question above, or write your own')
            : (isId ? 'Ajukan pertanyaan tentang pengetahuan perusahaan Anda' : 'Ask a question about your company knowledge')}
          disabled={isLoadingAnswer}
        />
        <button title={isId ? 'Kirim pertanyaan' : 'Send question'} disabled={isLoadingAnswer || !question.trim()}>
          {isLoadingAnswer ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
        </button>
      </form>
      {selectedSource && (
        <div className={`source-preview-backdrop ${sourceExpanded ? 'is-expanded' : ''}`} role="presentation" onClick={() => { setSourceExpanded(false); setSelectedSource(null) }}>
          <section className={`source-preview ${sourceExpanded ? 'is-expanded' : ''} ${pdfBeku ? 'is-resizing' : ''} ${sourcePdfSrc ? '' : 'is-text'}`} role="dialog" aria-modal="true" aria-label="Source preview" onClick={(event) => event.stopPropagation()}>
            <header>
              <span><FileText size={18} /> {sourceExpanded ? documentLabel(selectedSource) : (isId ? 'Sumber jawaban' : 'Answer source')}</span>
              <div className="source-preview-actions">
                <button
                  type="button"
                  className="icon-button"
                  title={sourceExpanded ? (isId ? 'Perkecil jendela' : 'Shrink window') : (isId ? 'Perbesar jendela' : 'Enlarge window')}
                  onClick={ubahUkuranJendela}
                >
                  {sourceExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button type="button" className="icon-button" title="Close" onClick={() => { setSourceExpanded(false); setSelectedSourceQuestion(null); setSelectedSource(null) }}><X size={18} /></button>
              </div>
            </header>
            {/* Dibungkus dua lapis supaya tingginya bisa dianimasikan sampai nol
                saat jendelanya dibesarkan; lihat .source-preview-title. */}
            <div className="source-preview-title">
              <div>
                <strong>{documentLabel(selectedSource)}</strong>
                <small>{[selectedSource.sectionTitle, selectedSource.pageNumber ? `Page ${selectedSource.pageNumber}` : null, selectedSource.version].filter(Boolean).join(' · ')}</small>
              </div>
            </div>
            {sourcePdfLoading && <div className="source-preview-loading">{isId ? 'Memuat PDF asli...' : 'Loading original PDF...'}</div>}
            {sourcePdfError && (
              <div className="source-preview-error" role="status">
                {isId
                  ? 'Berkas PDF aslinya tidak bisa dimuat. Yang ditampilkan di bawah hanya bagian yang dikutip.'
                  : 'The original PDF could not be loaded. Only the cited passage is shown below.'}
              </div>
            )}
            {sourcePdfSrc ? (
              <div className={`source-preview-pdf ${pdfBeku ? 'is-frozen' : ''}`} ref={pdfKotakRef}>
                <iframe
                  key={pdfMuatUlang}
                  style={pdfBeku ? { width: pdfBeku.lebar, height: pdfBeku.tinggi } : undefined}
                  title={`${documentLabel(selectedSource)} page ${selectedSource.pageNumber ?? 1}`}
                  src={sourcePdfSrc}
                />
              </div>
            ) : sourceChunks && sourceChunks.length > 0 ? (
              /* Dokumen non-PDF disusun ulang dari potongan teksnya. Potongan
                 yang dikutip AI ditandai dan digulirkan ke tengah, supaya
                 buktinya tetap mudah ditemukan di dokumen yang panjang. */
              <div className="source-preview-text" ref={pdfKotakRef}>
                {sourceChunks.map((chunk) => {
                  const dikutip = chunk.chunkId === selectedSource.chunkId
                  return (
                    <div
                      key={chunk.chunkId}
                      ref={dikutip ? potonganDikutipRef : undefined}
                      className={`source-chunk ${dikutip ? 'is-cited' : ''}`}
                    >
                      {(chunk.sectionTitle || chunk.pageNumber !== null) && (
                        <small>{[chunk.sectionTitle || null, chunk.pageNumber !== null ? `${isId ? 'Halaman' : 'Page'} ${chunk.pageNumber}` : null].filter(Boolean).join(' · ')}</small>
                      )}
                      <p>{chunk.text}</p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <blockquote>{sourcePreviewLoading ? (isId ? 'Memuat isi dokumen...' : 'Loading document...') : evidencePreview || (isId ? 'Cuplikan tidak tersedia untuk sumber ini.' : 'No excerpt is available for this source.')}</blockquote>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
