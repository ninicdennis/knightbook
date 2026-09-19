import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Testing Library only registers its automatic cleanup when a global `afterEach`
 * exists, which vitest provides only with `globals: true`. Unmounting explicitly
 * keeps the config honest and stops one test's DOM leaking into the next.
 */
afterEach(cleanup)

/**
 * Mantine components read these browser APIs that jsdom does not implement.
 * Without them the tests would fail on the environment rather than on the
 * behavior being tested.
 */
// Node-environment tests (the main process) share this setup file but have no window.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })

  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}
