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
