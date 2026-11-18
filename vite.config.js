import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    minify: true,
    sourcemap: false,
    target: 'es2020'
  }
});