import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/v1': 'http://localhost:3333' },
  },
  build: {
    target: 'es2020',
    // Orçamento de peso: o técnico usa 3G no campo.
    chunkSizeWarningLimit: 250,
  },
});
