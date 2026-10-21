import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: '',
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist'
  }
})