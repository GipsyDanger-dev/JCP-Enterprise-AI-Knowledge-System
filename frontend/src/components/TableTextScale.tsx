import { useEffect, useState } from 'react'
import { AArrowDown, AArrowUp } from 'lucide-react'

/**
 * Pengatur ukuran teks untuk tabel-tabel di panel Orang & akses.
 *
 * Terpisah dari pengaturan ukuran font global: isi tabel di sini paling padat
 * dan paling sering dibaca lama, jadi boleh dibesarkan sendiri tanpa ikut
 * mengubah seluruh aplikasi. Keduanya bertumpuk, bukan saling mengunci.
 *
 * Ketiga tab memakai kunci penyimpanan yang sama, jadi setelannya berlaku
 * untuk seluruh panel: sekali disetel di tab Pengguna, tab Unit kerja dan
 * Jabatan ikut. Tab-tab itu dirender bergantian — tidak pernah ada dua yang
 * tampil sekaligus — sehingga cukup dibaca ulang saat berpindah tanpa perlu
 * mengangkat state ke induknya.
 */
const KUNCI = 'jcp-users-table-scale'
export const TABLE_SCALE_MAX = 3

function bacaTersimpan(): number {
  const nilai = Number(localStorage.getItem(KUNCI))
  return Number.isInteger(nilai) && nilai >= 0 && nilai <= TABLE_SCALE_MAX ? nilai : 1
}

export interface KendaliUkuranTabel {
  scale: number
  turun: () => void
  naik: () => void
}

export function useTableTextScale(): KendaliUkuranTabel {
  const [scale, setScale] = useState(bacaTersimpan)
  useEffect(() => { localStorage.setItem(KUNCI, String(scale)) }, [scale])
  return {
    scale,
    turun: () => setScale((tingkat) => Math.max(0, tingkat - 1)),
    naik: () => setScale((tingkat) => Math.min(TABLE_SCALE_MAX, tingkat + 1)),
  }
}

export function TableTextScale({ scale, turun, naik, isId }: KendaliUkuranTabel & { isId: boolean }) {
  return (
    <div className="table-text-scale" role="group" aria-label={isId ? 'Ukuran teks tabel' : 'Table text size'}>
      <button
        type="button"
        className="icon-button"
        disabled={scale <= 0}
        title={isId ? 'Perkecil teks tabel' : 'Shrink table text'}
        aria-label={isId ? 'Perkecil teks tabel' : 'Shrink table text'}
        onClick={turun}
      >
        <AArrowDown size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={scale >= TABLE_SCALE_MAX}
        title={isId ? 'Perbesar teks tabel' : 'Enlarge table text'}
        aria-label={isId ? 'Perbesar teks tabel' : 'Enlarge table text'}
        onClick={naik}
      >
        <AArrowUp size={16} />
      </button>
    </div>
  )
}
