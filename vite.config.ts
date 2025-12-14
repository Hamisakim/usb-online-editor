import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './', // Use relative paths for assets
  resolve: {
    alias: {
      // Stub out Node.js modules not needed in browser
      'iconv-lite': new URL('./src/stubs/empty.js', import.meta.url).pathname,
      'string_decoder': new URL('./src/stubs/empty.js', import.meta.url).pathname,
      'zlib': new URL('./src/stubs/empty.js', import.meta.url).pathname,
      'buffer': new URL('./src/stubs/empty.js', import.meta.url).pathname,
    }
  },
  optimizeDeps: {
    include: ['rekordbox-parser'], // Pre-bundle to convert CJS to ESM
  },
  build: {
    commonjsOptions: {
      include: [/rekordbox-parser/, /node_modules/]
    }
  }
})
