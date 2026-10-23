import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Porta própria: a 5173 é o padrão do Vite e pode estar presa ao cache de outro projeto no navegador.
    port: 5180,
    strictPort: true,
    // 127.0.0.1 e não "localhost": a API local só escuta no IPv4 do próprio computador.
    proxy: { '/v1': 'http://127.0.0.1:3333' },
  },
  build: {
    target: 'es2020',
    // Orçamento de peso: o técnico usa 3G no campo.
    chunkSizeWarningLimit: 250,
  },
});
