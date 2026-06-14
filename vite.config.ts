import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Force Vite to use a single instance of Three.js
    dedupe: ['three'],
  },
  optimizeDeps: {
    include: ['three'],
  },
});
