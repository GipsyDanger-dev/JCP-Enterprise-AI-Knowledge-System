import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export interface ConfirmRequest {
  title: string
  /** Penjelasan akibatnya — boleh memuat <strong> untuk menebalkan nama. */
  body: ReactNode
  /**
   * Teks tombol aksinya. Dikosongkan untuk dialog yang hanya mengabarkan
   * sesuatu — tanpa ini, kabar "belum bisa dihapus" terpaksa dipasangi tombol
   * yang tidak melakukan apa-apa, dan tombol semacam itu selalu terbaca sebagai
   * "lanjutkan saja".
   */
  confirmLabel?: string
  cancelLabel: string
  /** 'danger' untuk tindakan yang mencabut sesuatu; selain itu tombol biasa. */
  tone?: 'danger' | 'primary'
  /**
   * Kalau diisi, tombol aksinya baru hidup setelah teks ini diketik ulang
   * persis. Dipakai untuk yang tidak bisa dibatalkan: satu klik terlalu murah
   * untuk tindakan yang tidak punya tombol urung.
   */
  confirmPhrase?: string
  /** Label di atas kotak ketiknya, mis. "Ketik nama akunnya untuk memastikan". */
  confirmPhraseLabel?: string
}

/**
 * Pengganti window.confirm yang memakai kerangka modal aplikasi.
 *
 * Bentuknya sengaja tetap berupa janji yang menghasilkan true/false supaya
 * pemanggilnya menulis `if (!await tanya(...)) return` — sama seperti dulu —
 * dan tidak perlu memecah alurnya menjadi rangkaian state.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const jawab = useRef<((setuju: boolean) => void) | null>(null)

  const tanya = useCallback(
    (req: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        // Permintaan yang tersalip dianggap dibatalkan supaya janji lamanya
        // tidak menggantung selamanya.
        jawab.current?.(false)
        jawab.current = resolve
        setRequest(req)
      }),
    [],
  )

  const tutup = useCallback((setuju: boolean) => {
    jawab.current?.(setuju)
    jawab.current = null
    setRequest(null)
  }, [])

  return {
    tanya,
    dialog: request ? <ConfirmDialog request={request} onAnswer={tutup} /> : null,
  }
}

function ConfirmDialog({ request, onAnswer }: { request: ConfirmRequest; onAnswer: (setuju: boolean) => void }) {
  const titleId = useId()
  const phraseId = useId()
  const [ketikan, setKetikan] = useState('')
  // Tanpa frasa, tombolnya hidup seperti biasa.
  const bolehLanjut = !request.confirmPhrase || ketikan.trim() === request.confirmPhrase

  // Esc membatalkan, seperti dialog bawaan peramban yang digantikan.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onAnswer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAnswer])

  return (
    <div className="modal-overlay" onClick={() => onAnswer(false)}>
      <div
        className="modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>{request.title}</h2>
          <button type="button" className="icon-button" aria-label={request.cancelLabel} onClick={() => onAnswer(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-copy">{request.body}</p>
          {request.confirmPhrase && (
            <label className="confirm-phrase" htmlFor={phraseId}>
              <span>{request.confirmPhraseLabel ?? request.confirmPhrase}</span>
              <input
                id={phraseId}
                type="text"
                value={ketikan}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setKetikan(event.target.value)}
              />
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={() => onAnswer(false)}>
            {request.cancelLabel}
          </button>
          {request.confirmLabel && (
            <button
              type="button"
              className={request.tone === 'primary' ? 'primary-button' : 'danger-button'}
              autoFocus={!request.confirmPhrase}
              disabled={!bolehLanjut}
              onClick={() => onAnswer(true)}
            >
              {request.confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
