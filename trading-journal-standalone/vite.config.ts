import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In local dev, run `vercel dev` instead for the /api routes to work,
      // or point this at a deployed instance's URL if you just want the UI.
      '/api': 'http://localhost:3000',
    },
  },
});
