/**
 * Helper pembacaan environment variable.
 *
 * Berbeda dengan `process.env.X ?? fallback`, helper ini memperlakukan string
 * kosong / whitespace sama seperti variabel yang tidak di-set. Ini penting karena
 * docker-compose meneruskan `${VAR}` sebagai string kosong ketika `.env` tidak
 * memuat baris tersebut — dengan `??`, fallback tidak pernah jalan dan aplikasi
 * memanggil URL kosong tanpa pesan error yang jelas.
 */
export function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

/**
 * Base URL AI service — satu sumber kebenaran untuk ChatService dan
 * DocumentProcessorService. Trailing slash dibuang agar `${base}/ingest`
 * tidak menghasilkan URL dengan double slash.
 */
export function aiServiceUrl(): string {
  return envOrDefault('AI_SERVICE_URL', 'http://localhost:8001').replace(/\/+$/, '');
}

/**
 * Shared secret antara backend dan AI service. Sama seperti WorkerTokenGuard,
 * token yang kosong dianggap salah konfigurasi — lebih baik gagal keras daripada
 * memanggil AI service tanpa identitas.
 */
export function workerToken(): string {
  const token = process.env.WORKER_TOKEN?.trim();
  if (!token) throw new Error('WORKER_TOKEN is required');
  return token;
}

/**
 * Header standar untuk setiap panggilan backend -> AI service. Endpoint AI
 * (selain /health) menolak permintaan tanpa `X-Worker-Token` yang cocok.
 */
export function aiServiceHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Worker-Token': workerToken(),
  };
}
