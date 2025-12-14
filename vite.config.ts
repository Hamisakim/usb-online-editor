import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './', // Use relative paths for assets
  resolve: {
    alias: {
      // Provide empty stubs for Node.js modules that aren't needed in browser
      'iconv-lite': 'data:text/javascript,export default {}',
      'string_decoder': 'data:text/javascript,export default {}',
      'zlib': 'data:text/javascript,export default {}',
      'buffer': 'data:text/javascript,export default {}',
    }
  },
  optimizeDeps: {
    exclude: ['rekordbox-parser']
  },
  build: {
    commonjsOptions: {
      include: [/rekordbox-parser/, /node_modules/]
    }
  }
})
