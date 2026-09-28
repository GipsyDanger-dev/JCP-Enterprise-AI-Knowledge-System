/*
 * Preferensi tutorial disimpan per akun, bukan per peramban: satu komputer
 * kantor bisa dipakai bergantian, dan centang "jangan tampilkan lagi" milik
 * satu orang tidak boleh menyembunyikan tutorial dari rekan yang baru masuk.
 */
const HIDDEN_KEY = 'jcp-tutorial-hidden'
const PENDING_KEY = 'jcp-tutorial-pending'

export function isTutorialHidden(userId: string) {
  return localStorage.getItem(`${HIDDEN_KEY}:${userId}`) === 'true'
}

export function setTutorialHidden(userId: string, hidden: boolean) {
  if (hidden) localStorage.setItem(`${HIDDEN_KEY}:${userId}`, 'true')
  else localStorage.removeItem(`${HIDDEN_KEY}:${userId}`)
}

/*
 * Tutorial hanya muncul sekali per login, bukan setiap muat ulang. Login
 * meninggalkan penanda ini; halaman akun pertama yang terbuka memakainya lalu
 * menghapusnya, jadi refresh sesudahnya tidak menemukan apa-apa lagi.
 */
export function markTutorialPending() {
  sessionStorage.setItem(PENDING_KEY, 'true')
}

export function takeTutorialPending() {
  const pending = sessionStorage.getItem(PENDING_KEY) === 'true'
  sessionStorage.removeItem(PENDING_KEY)
  return pending
}
