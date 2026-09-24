/** Lets a browser session see which host operations actually fired. */
export function record(name: string, ...args: unknown[]): void {
  const log = ((window as unknown as { __calls?: unknown[] }).__calls ??= [])
  log.push([name, ...args])
}
