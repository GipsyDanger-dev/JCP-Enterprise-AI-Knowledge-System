import { useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { errorMessage } from '@/api/client'
import { useWorkspace } from '@/hooks/useWorkspace'

interface Props {
  /** Teks tautan pembuka, mis. "Tambah unit kerja". */
  label: string
  placeholder: string
  /** Keterangan yang ikut berubah saat mengetik — dipakai memperlihatkan kode yang akan dibuat. */
  hint?: (value: string) => string | null
  minLength?: number
  maxLength?: number
  disabled?: boolean
  /** Membuat barisnya. Lemparan ditangkap di sini dan diteruskan ke onError. */
  onSave: (value: string) => Promise<void>
  onError: (message: string | null) => void
}

/**
 * Tautan "+ Tambah …" yang berubah jadi satu bidang isian di tempat.
 *
 * Mengikuti pola yang sudah dipakai "Tambah kategori" di dialog unggah: admin
 * yang sedang mengisi formulir lalu mendapati pilihan yang dibutuhkannya belum
 * ada tidak perlu membatalkan pekerjaannya, pindah tab, lalu mengisi ulang dari
 * awal. Yang baru dibuat langsung terpilih.
 */
export function InlineAdd({ label, placeholder, hint, minLength = 2, maxLength = 120, disabled, onSave, onError }: Props) {
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const boleh = value.trim().length >= minLength && !saving

  const tutup = () => { setOpen(false); setValue('') }

  const simpan = async () => {
    if (!boleh) return
    setSaving(true)
    try {
      await onSave(value.trim())
      onError(null)
      tutup()
    } catch (err) {
      onError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="link-button inline-add-open" onClick={() => setOpen(true)} disabled={disabled}>
        <Plus size={15} /> {label}
      </button>
    )
  }

  return (
    <div className="inline-add">
      <input
        type="text"
        value={value}
        autoFocus
        aria-label={label}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={saving}
        onChange={(event) => setValue(event.target.value)}
        // Enter di sini tidak boleh ikut mengirim formulir induknya — yang
        // sedang dibuat baru barisnya, bukan akunnya.
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); simpan() }
          if (event.key === 'Escape') { event.preventDefault(); tutup() }
        }}
      />
      <button type="button" className="secondary-button" disabled={!boleh} onClick={simpan}>
        {saving ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {isId ? 'Simpan' : 'Save'}
      </button>
      <button type="button" className="icon-button" aria-label={isId ? 'Batal' : 'Cancel'} onClick={tutup} disabled={saving}>
        <X size={15} />
      </button>
      {hint && value.trim() && <p className="field-hint inline-add-hint">{hint(value.trim())}</p>}
    </div>
  )
}
