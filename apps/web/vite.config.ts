import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    // changeOrigin: false — Host остаётся localhost:5180, иначе API (CSRF-проверка Origin vs Host) отклонит POST/PATCH/DELETE
    proxy: { '/api': { target: 'http://localhost:3100', changeOrigin: false } },
  },
});
