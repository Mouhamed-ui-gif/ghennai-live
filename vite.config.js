import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE || '/ghennai-app/',
  plugins: [react()],
  server: {
    host: '::',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3002' }
  }
})
