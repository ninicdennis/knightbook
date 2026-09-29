import { binaryArchitecture } from '../../../apps/desktop/scripts/binary-architecture.mjs'

/**
 * Whether each packaged app carries a Node runtime built for its own CPU.
 *
 * The app's own executable is the reference: Electron is built per
 * architecture, so it always runs on the CPU the package is for. The runtime
 * beside it is what staging put there, and staging is what could go wrong. A
 * runtime shared by two packages, or swapped between them, fails for at least
 * one of them.
 */

export interface PackagedBinaries {
  /** Where the package is, for the failure message. */
  readonly name: string
  readonly executablePath: string
  readonly nodePath: string
}

/** The CPUs the given app executables are built for, sorted; unreadable ones are left out. */
export async function packagedCpus(executablePaths: readonly string[]): Promise<string[]> {
  const cpus: string[] = []
  for (const path of executablePaths) {
    const cpu = (await binaryArchitecture(path))?.arch
    if (cpu) cpus.push(cpu)
  }
  return cpus.sort()
}

/** One line per package whose runtime is not for the app's CPU; empty when all match. */
export async function runtimeMismatches(apps: readonly PackagedBinaries[]): Promise<string[]> {
  const mismatches: string[] = []
  for (const app of apps) {
    const appCpu = (await binaryArchitecture(app.executablePath))?.arch ?? null
    const nodeCpu = (await binaryArchitecture(app.nodePath))?.arch ?? null
    if (appCpu === null || appCpu !== nodeCpu) {
      mismatches.push(
        `${app.name}: the app is built for ${appCpu ?? 'an unreadable CPU'} ` +
          `but its Node runtime is built for ${nodeCpu ?? 'an unreadable CPU'}`,
      )
    }
  }
  return mismatches
}
