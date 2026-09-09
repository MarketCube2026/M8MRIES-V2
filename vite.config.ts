import { defineConfig } from 'vite';

// Vite's built-in esbuild handles TSX; keeping the config free of Babel makes
// the local MVP resilient when the optional browserslist data is unavailable.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  esbuild: { jsx: 'automatic' },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
