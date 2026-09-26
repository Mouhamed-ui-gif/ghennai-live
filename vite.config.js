import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE || '/ghennai-app/',
  plugins: [react()],
  server: {
    host: '::',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3001', '/live': 'http://localhost:3001' },
    watch: {
      // تجاهل مجلدات البيانات والمشاريع: كتابة الوكيل لملفات المواقع
      // يجب ألا تُعيد تحميل صفحة التطوير أبدًا (كانت تُغلق الاستوديو فجأة)
      ignored: ['**/server/workspace/**', '**/server/data/**', '**/dist/**', '**/node_modules/**', '**/.git/**', '**/tests/**'],
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    // لا تسبق تحميل المحررات الثقيلة (monaco/xterm/workers ≈ 12MB) —
    // تُجلب عند فتح الاستوديو فقط، والدخول يبقى خفيفًا.
    modulePreload: {
      resolveDependencies: (filename, deps) =>
        deps.filter((d) => !/monaco|editor\.worker|ts\.worker|css\.worker|html\.worker|json\.worker|xterm/i.test(d)),
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand', 'framer-motion'],
          monaco: ['@monaco-editor/react', 'monaco-editor'],
          xterm: ['@xterm/xterm', '@xterm/addon-fit'],
        },
      },
    },
  },
})
