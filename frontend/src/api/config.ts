/**
 * true = pakai mock backend (tanpa server) — aktif default di development.
 * Matikan dengan VITE_USE_MOCK_AUTH=false saat backend siap.
 * Di produksi hanya aktif bila dieksplisitkan VITE_USE_MOCK_AUTH=true.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK_AUTH === 'true'
  || (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_AUTH !== 'false')
