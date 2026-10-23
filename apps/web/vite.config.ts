import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Porta própria: a 5173 é o padrão do Vite e pode estar presa ao cache de outro projeto no navegador.
    port: 5180,
    strictPort: true,
    proxy: { '/v1': 'http://localhost:3333' },
  },
  build: {
    target: 'es2020',
    // Orçamento de peso: o técnico usa 3G no campo.
    chunkSizeWarningLimit: 250,
  },
});
