import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    target: 'es2022',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/index.ts',
      name: 'WebSpiderPet',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
