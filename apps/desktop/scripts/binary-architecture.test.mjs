// @vitest-environment node
import { arch as hostArch, execPath, platform } from 'node:process'
import { describe, expect, it } from 'vitest'
import { architectureFromHeader, binaryArchitecture } from './binary-architecture.mjs'

/**
 * Headers built byte for byte from each format's published layout, so every
 * format and CPU is covered on whichever machine runs this. The last case reads
 * a real executable, the Node running the test, to tie the synthetic ones to
 * something a linker actually produced.
 */

function machO(cpuType) {
  const bytes = new Uint8Array(32)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0xfeedfacf, true)
  view.setUint32(4, cpuType, true)
  return bytes
}

function elf(machine) {
  const bytes = new Uint8Array(64)
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1])
  new DataView(bytes.buffer).setUint16(18, machine, true)
  return bytes
}

function pe(machine) {
  const bytes = new Uint8Array(0x100)
  const view = new DataView(bytes.buffer)
  bytes.set([0x4d, 0x5a])
  view.setUint32(0x3c, 0x80, true)
  view.setUint32(0x80, 0x00004550, true)
  view.setUint16(0x84, machine, true)
  return bytes
}

describe('reading the CPU from an executable header', () => {
  it('tells an Apple silicon Mach-O from an Intel one', () => {
    expect(architectureFromHeader(machO(0x0100000c))).toEqual({ format: 'mach-o', arch: 'arm64' })
    expect(architectureFromHeader(machO(0x01000007))).toEqual({ format: 'mach-o', arch: 'x64' })
  })

  it('names a universal Mach-O as universal, not as one of its slices', () => {
    const fat = new Uint8Array(8)
    new DataView(fat.buffer).setUint32(0, 0xcafebabe, false)

    expect(architectureFromHeader(fat)).toEqual({ format: 'mach-o-universal', arch: null })
  })

  it('reads ELF and PE machines', () => {
    expect(architectureFromHeader(elf(0x3e))).toEqual({ format: 'elf', arch: 'x64' })
    expect(architectureFromHeader(elf(0xb7))).toEqual({ format: 'elf', arch: 'arm64' })
    expect(architectureFromHeader(pe(0x8664))).toEqual({ format: 'pe', arch: 'x64' })
    expect(architectureFromHeader(pe(0xaa64))).toEqual({ format: 'pe', arch: 'arm64' })
  })

  it('reports a CPU it does not know as null rather than guessing', () => {
    expect(architectureFromHeader(elf(0x28))).toEqual({ format: 'elf', arch: null })
  })

  it('does not recognise a file that is not an executable', () => {
    expect(architectureFromHeader(new TextEncoder().encode('#!/bin/sh\necho hi\n'))).toBeNull()
    expect(architectureFromHeader(new Uint8Array(0))).toBeNull()
  })

  it('reads the Node binary running this test as the CPU it runs on', async () => {
    const expectedFormat = { darwin: 'mach-o', linux: 'elf', win32: 'pe' }[platform]

    expect(await binaryArchitecture(execPath)).toEqual({ format: expectedFormat, arch: hostArch })
  })
})
