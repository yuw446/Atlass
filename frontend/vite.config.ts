import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served from GitHub Pages under /Atlass/ (project site). Every local asset fetch goes through import.meta.env.BASE_URL.
export default defineConfig({
  base: '/Atlass/',
  plugins: [react(), tailwindcss()],
  server: {
    // shared/ lives one level above the frontend package
    fs: { allow: ['..'] },
    // Local dev reads the live feed from Pages, so the globe is real without running the worker
    proxy: {
      '/Atlass/data/latest.json': { target: 'https://yuw446.github.io', changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1800, // the globe vendor chunk is ~1.7 MB minified, ~490 KB gzipped, and loads lazily
    rollupOptions: {
      output: {
        // Three.js and Globe.gl change only when upgraded; keep them in a chunk returning viewers already have
        manualChunks(id) {
          if (/node_modules\/(three|three-globe|globe\.gl|react-globe\.gl)\//.test(id)) return 'globe-vendor'
        },
      },
    },
  },
})
