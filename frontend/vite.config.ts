import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// FRONTEND_PORT tinggal di .env root repo (bareng BACKEND_PORT), bukan di frontend/.env,
// jadi loadEnv diarahkan ke sana. process.env menang supaya port dari shell/compose
// tetap dipakai tanpa perlu file .env sama sekali.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_PORT = 5173

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, repoRoot, 'FRONTEND_PORT')
  const port = Number(process.env.FRONTEND_PORT ?? fileEnv.FRONTEND_PORT) || DEFAULT_PORT

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      port,
    },
  }
})
