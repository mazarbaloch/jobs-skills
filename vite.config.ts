import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/data/job_skills.json')) return 'observations';
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
