import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.tsx', 'src/main/**/*.test.ts'],
    setupFiles: ['./src/renderer/test-setup.ts'],
  },
})
