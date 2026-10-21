import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // The build scripts are plain JavaScript and run under Node, not jsdom;
    // each of those files asks for the node environment in its own docblock.
    include: [
      'src/renderer/**/*.test.tsx',
      'src/main/**/*.test.ts',
      'src/shared/**/*.test.ts',
      'scripts/**/*.test.mjs',
    ],
    setupFiles: ['./src/renderer/test/test-setup.ts'],
    // The rendered-board tests take 1 to 3 s on Linux but up to 10 s on GitHub's
    // Windows runners while `pnpm -r test` runs every package at once, which the
    // 5 s default failed on. A hung test still fails, just later.
    testTimeout: 30_000,
  },
})
