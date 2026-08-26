import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  // code-server exposes this server below /proxy/5173/. Relative build assets
  // keep working both there and when the dist is served at an origin root.
  base: './',
  plugins: [react()],
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: apiProxy,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: apiProxy,
  },
});
