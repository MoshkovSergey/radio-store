import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base условный: в dev админка живёт на "/" (localhost:5173),
// в прод-сборке — на "/admin/", чтобы nginx раздавал её по префиксу /admin.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/admin/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}))