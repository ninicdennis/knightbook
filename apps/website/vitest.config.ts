import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The layout test builds the whole site once before its checks.
    hookTimeout: 120_000,
  },
})
