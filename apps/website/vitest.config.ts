import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The layout and download tests build the whole site before their checks.
    hookTimeout: 120_000,
    // Two `astro build` runs at once in one project share Astro's build cache and
    // crash each other, so the test files run one after another.
    fileParallelism: false,
  },
})
