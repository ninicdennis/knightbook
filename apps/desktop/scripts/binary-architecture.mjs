import { open } from 'node:fs/promises'

/**
 * The CPU an executable was built for, read from its header rather than from
 * its name or the folder it sits in.
 *
 * This exists because the macOS build packages two architectures in one run,
 * and a runtime staged for the wrong one looks exactly like the right one: the
 * file is called `node` either way. Only the header says which CPU it runs on.
 *
 * Covers the three formats this project ships: Mach-O (macOS), ELF (Linux) and
 * PE (Windows). A universal (fat) Mach-O is reported as such rather than as one
 * of its slices, because shipping one would be a decision, not an accident.
 */

/** Enough to reach the PE header, which sits at an offset the DOS stub names. */
const HEADER_BYTES = 4096

const MACHO_64_MAGIC = 0xfeedfacf
const MACHO_FAT_MAGIC = 0xcafebabe
const MACHO_CPU = { 0x01000007: 'x64', 0x0100000c: 'arm64' }

const ELF_MACHINE = { 0x3e: 'x64', 0xb7: 'arm64' }

const PE_MACHINE = { 0x8664: 'x64', 0xaa64: 'arm64' }

/**
 * @param {Uint8Array} bytes The start of the file.
 * @returns {{ format: 'mach-o' | 'mach-o-universal' | 'elf' | 'pe', arch: string | null } | null}
 *   `arch` is Node's name for the CPU (`x64`, `arm64`), or null for a CPU this
 *   project does not build; the whole result is null when the format is unknown.
 */
export function architectureFromHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 8) return null

  if (view.getUint32(0, true) === MACHO_64_MAGIC) {
    return { format: 'mach-o', arch: MACHO_CPU[view.getUint32(4, true)] ?? null }
  }
  if (view.getUint32(0, false) === MACHO_FAT_MAGIC) {
    return { format: 'mach-o-universal', arch: null }
  }

  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    if (bytes.byteLength < 20) return null
    const littleEndian = bytes[5] === 1
    return { format: 'elf', arch: ELF_MACHINE[view.getUint16(18, littleEndian)] ?? null }
  }

  if (bytes[0] === 0x4d && bytes[1] === 0x5a && bytes.byteLength >= 0x40) {
    const peOffset = view.getUint32(0x3c, true)
    if (peOffset + 6 > bytes.byteLength) return null
    if (view.getUint32(peOffset, true) !== 0x00004550) return null
    return { format: 'pe', arch: PE_MACHINE[view.getUint16(peOffset + 4, true)] ?? null }
  }

  return null
}

/** Reads the start of a file and names its CPU; see `architectureFromHeader`. */
export async function binaryArchitecture(path) {
  const file = await open(path, 'r')
  try {
    const buffer = new Uint8Array(HEADER_BYTES)
    const { bytesRead } = await file.read(buffer, 0, HEADER_BYTES, 0)
    return architectureFromHeader(buffer.subarray(0, bytesRead))
  } finally {
    await file.close()
  }
}
