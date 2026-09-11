import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export interface ConfirmRequest {
  title: string
  /** Penjelasan akibatnya — boleh memuat <strong> untuk menebalkan nama. */
  body: ReactNode
  confirmLabel: string
  cancelLabel: string
  /** 'danger' untuk tindakan yang mencabut sesuatu; selain itu tombol biasa. */
  tone?: 'danger' | 'primary'
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
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={() => onAnswer(false)}>
            {request.cancelLabel}
          </button>
          <button
            type="button"
            className={request.tone === 'primary' ? 'primary-button' : 'danger-button'}
            autoFocus
            onClick={() => onAnswer(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
