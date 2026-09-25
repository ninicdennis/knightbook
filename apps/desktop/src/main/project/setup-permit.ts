/**
 * Setup writes into a folder, so it is limited to the one the user just picked in
 * the folder dialog. A renderer that named some other path is refused, and the
 * permit is spent once the project exists.
 */
let folderAwaitingSetup: string | null = null

export function allowSetupFor(path: string | null): void {
  folderAwaitingSetup = path
}

/** Returns the path when it is the permitted folder; otherwise throws. */
export function assertAwaitingSetup(path: unknown): string {
  if (typeof path !== 'string' || path !== folderAwaitingSetup) {
    throw new Error('Choose the folder again to set it up.')
  }
  return path
}
