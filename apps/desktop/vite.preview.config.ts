import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Serves the board against stub data for design review. Not a shipped build. */
export default defineConfig({
  root: 'preview',
  plugins: [react()],
  server: { port: 5199, strictPort: true },
})
