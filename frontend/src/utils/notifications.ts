/**
 * Notification sound + vibration + browser popup utilities.
 * Uses HTMLAudioElement for sound (works in non-user-gesture contexts like setInterval).
 * Generates a short ding-dong tone as a base64 WAV data URI.
 */

/** Generate a short two-tone WAV file as data URI */
function generateDingDongDataUri(): string {
  const sampleRate = 22050
  const duration = 0.6
  const numSamples = Math.floor(sampleRate * duration)
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true)  // PCM
  view.setUint16(22, 1, true)  // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true)  // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, numSamples * 2, true)

  // Generate two-tone sine wave
  const frequencies = [
    { freq: 880, start: 0, end: 0.3 },      // A5 — first ding
    { freq: 660, start: 0.15, end: 0.55 },   // E5 — second dong
  ]

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    let sample = 0

    for (const { freq, start, end } of frequencies) {
      if (t >= start && t <= end) {
        const localT = t - start
        // Envelope: quick attack, exponential decay
        const envelope = Math.exp(-localT * 8) * (1 - Math.exp(-localT * 100))
        sample += Math.sin(2 * Math.PI * freq * localT) * envelope * 0.35
      }
    }

    // Clamp and write
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + i * 2, Math.floor(clamped * 32767), true)
  }

  // Convert to base64
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return `data:audio/wav;base64,${btoa(binary)}`
}

let cachedAudioSrc: string | null = null

function getAudioSrc(): string {
  if (!cachedAudioSrc) {
    cachedAudioSrc = generateDingDongDataUri()
  }
  return cachedAudioSrc
}

/** Play a two-tone notification sound (ding-dong) */
export function playNotificationSound(): void {
  try {
    const audio = new Audio(getAudioSrc())
    audio.volume = 0.5
    audio.play().catch(() => {
      // Autoplay blocked — silently ignore
    })
  } catch {
    // Audio not supported — silently ignore
  }
}

/** Trigger device vibration (mobile only, 200ms pattern) */
export function vibrateDevice(): void {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100])
    }
  } catch {
    // Vibration not supported — silently ignore
  }
}

const NOTIF_KEY = 'jcp-notifications'
const BROWSER_NOTIF_KEY = 'jcp-browser-notif'

/** Check if notifications are enabled */
export function isNotificationsEnabled(): boolean {
  const v = localStorage.getItem(NOTIF_KEY)
  return v !== 'false' // default true
}

/** Toggle notifications setting */
export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIF_KEY, String(enabled))
}

/** Check if browser notifications are enabled */
export function isBrowserNotificationsEnabled(): boolean {
  const v = localStorage.getItem(BROWSER_NOTIF_KEY)
  return v !== 'false' // default true
}

/** Toggle browser notifications setting */
export function setBrowserNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(BROWSER_NOTIF_KEY, String(enabled))
}

/** Request browser notification permission (call on user click) */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return await Notification.requestPermission()
}

/** Show a browser notification popup */
export function showBrowserNotification(title: string, body: string, icon?: string): void {
  if (!isBrowserNotificationsEnabled()) return
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    const notif = new Notification(title, {
      body,
      icon: icon ?? '/vite.svg',
      badge: '/vite.svg',
      tag: 'jcp-message', // replaces previous notification
      renotify: true,
    })
    notif.onclick = () => {
      window.focus()
      notif.close()
    }
  } catch {
    // Notification constructor failed — silently ignore
  }
}

/** Play notification sound + vibrate + browser popup (respects settings) */
export function notifyNewMessage(senderName?: string, preview?: string): void {
  if (!isNotificationsEnabled()) return
  playNotificationSound()
  vibrateDevice()
  showBrowserNotification(
    senderName ? `Pesan dari ${senderName}` : 'Pesan baru',
    preview ?? 'Anda memiliki pesan baru.',
  )
}
