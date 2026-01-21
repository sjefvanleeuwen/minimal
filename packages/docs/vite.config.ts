import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5174,
    watch: {
      usePolling: true
    }
  },
  build: {
    target: 'esnext'
  }
});
