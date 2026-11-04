import { defineConfig } from 'vite';

// base './' keeps every asset path relative, so the built site runs from any folder or host.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
  },
  server: { host: true },
});
