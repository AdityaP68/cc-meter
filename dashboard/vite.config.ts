import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// Built to static files in dashboard/dist and served by `agent-lens serve` (127.0.0.1 only).
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  build: { outDir: path.join(import.meta.dirname, 'dist'), emptyOutDir: true, sourcemap: false },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:7337' } },
});
