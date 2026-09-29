/** Types for binary-architecture.mjs, so the TypeScript packaging tests can import it. */

export interface BinaryArchitecture {
  readonly format: 'mach-o' | 'mach-o-universal' | 'elf' | 'pe'
  /** Node's name for the CPU, or null for one this project does not build. */
  readonly arch: string | null
}

export function architectureFromHeader(bytes: Uint8Array): BinaryArchitecture | null

export function binaryArchitecture(path: string): Promise<BinaryArchitecture | null>
