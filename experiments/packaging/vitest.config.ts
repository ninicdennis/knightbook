import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Staging a Node runtime and launching real subprocesses is slower than a
    // unit test, and these must not run in parallel against one staging dir.
    testTimeout: 120_000,
    fileParallelism: false,
  },
})
