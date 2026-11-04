import { defineConfig } from 'vite';

// base './' keeps every asset path relative, so the built site runs from any folder or host.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // three.js in its own long-cached file
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
  server: { host: true },
});
