import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Separa libs grandes em chunks próprios — melhora cache do navegador
    // (vendor muda pouco) e paraleliza o download.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/react|react-dom|react-router/.test(id)) return 'react-vendor';
            if (/@tanstack|axios/.test(id)) return 'data-vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
