import type { KnightbookApi } from '../shared/contract.js'

declare global {
  interface Window {
    knightbook: KnightbookApi
  }
}
