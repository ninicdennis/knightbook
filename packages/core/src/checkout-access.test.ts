import { cp, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { grantCheckoutAccess, readAccessRegistry, revokeCheckoutAccess } from './access-registry.js'
import {
  describeEnabledCheckouts,
  findEnabledCheckout,
  resolveEnabledCheckout,
} from './checkout-access.js'
import { RESERVED_DIR } from './paths.js'
import { initializeProject, openProject, type Project } from './project.js'

/**
 * The registry decides what an AI can reach through the shared connection, so
 * these tests are about refusals as much as about access: nothing may fall back
 * to another checkout, and a damaged file must never read as "no grants" or be
 * overwritten.
 */

let workspace: string
let registry: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-access-'))
  registry = join(workspace, 'app-data', 'mcp-access.json')
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function project(folder: string, name: string): Promise<Project> {
  return await initializeProject(join(workspace, folder), { name })
}

async function enable(target: Project) {
  return await grantCheckoutAccess(registry, {
    path: target.root.path,
    projectId: target.frontmatter.id,
    name: target.frontmatter.name,
  })
}

describe('the access registry', () => {
  it('grants nothing before anything is enabled', async () => {
    expect((await readAccessRegistry(registry)).checkouts).toEqual([])
  })

  it('resolves an enabled checkout to its own project', async () => {
    const alpha = await project('alpha', 'Alpha')
    const entry = await enable(alpha)

    const resolved = await resolveEnabledCheckout(registry, entry.checkout_id)
    expect(resolved.project.root.path).toBe(alpha.root.path)
  })

  it('keeps a checkout_id when the same folder is enabled again', async () => {
    const alpha = await project('alpha', 'Alpha')
    const first = await enable(alpha)
    const second = await enable(alpha)

    expect(second.checkout_id).toBe(first.checkout_id)
    expect((await readAccessRegistry(registry)).checkouts).toHaveLength(1)
  })

  it('refuses an id nobody enabled', async () => {
    await expect(resolveEnabledCheckout(registry, 'made-up')).rejects.toMatchObject({
      code: 'checkout_not_enabled',
    })
  })

  it('refuses a checkout once it has been disabled, from the next call on', async () => {
    const alpha = await project('alpha', 'Alpha')
    const entry = await enable(alpha)
    await resolveEnabledCheckout(registry, entry.checkout_id)

    expect(await revokeCheckoutAccess(registry, alpha.root.path)).toBe(true)
    await expect(resolveEnabledCheckout(registry, entry.checkout_id)).rejects.toMatchObject({
      code: 'checkout_not_enabled',
    })
  })

  it('tells clones apart even with the same project id and name', async () => {
    const original = await project('original', 'Same')
    const clonePath = join(workspace, 'clone')
    await cp(original.root.path, clonePath, { recursive: true })
    // A copied folder is a clone: same project.md, so the same UUID and name.
    const clone = await openProject(clonePath)

    const a = await enable(original)
    const b = await enable(clone)
    expect(a.checkout_id).not.toBe(b.checkout_id)

    const listed = await describeEnabledCheckouts(registry)
    expect(listed.map((entry) => entry.checkoutPath).sort()).toEqual(
      [original.root.path, clone.root.path].sort(),
    )
    expect(listed.find((entry) => entry.checkoutId === a.checkout_id)?.sameProjectAs).toEqual([
      b.checkout_id,
    ])
    expect((await resolveEnabledCheckout(registry, b.checkout_id)).project.root.path).toBe(
      clone.root.path,
    )
  })

  it('reports a moved folder instead of rebinding it to a clone', async () => {
    const original = await project('original', 'Same')
    const clonePath = join(workspace, 'clone')
    await cp(original.root.path, clonePath, { recursive: true })
    await enable(await openProject(clonePath))
    const entry = await enable(original)

    await rename(original.root.path, join(workspace, 'moved'))

    await expect(resolveEnabledCheckout(registry, entry.checkout_id)).rejects.toMatchObject({
      code: 'checkout_unavailable',
    })
    const listed = await describeEnabledCheckouts(registry)
    const moved = listed.find((item) => item.checkoutId === entry.checkout_id)
    expect(moved?.available).toBe(false)
    expect(moved?.unavailableReason).toMatch(/not found/)
  })

  it('refuses a folder that now holds a different project', async () => {
    const alpha = await project('alpha', 'Alpha')
    const entry = await enable(alpha)
    await rm(join(alpha.root.path, RESERVED_DIR), { recursive: true, force: true })
    await initializeProject(alpha.root.path, { name: 'Impostor' })

    await expect(resolveEnabledCheckout(registry, entry.checkout_id)).rejects.toMatchObject({
      code: 'checkout_mismatch',
    })
  })

  it('reports an enabled folder whose records are gone as unavailable, not initializable', async () => {
    const alpha = await project('alpha', 'Alpha')
    const entry = await enable(alpha)
    await rm(join(alpha.root.path, RESERVED_DIR), { recursive: true, force: true })

    await expect(resolveEnabledCheckout(registry, entry.checkout_id)).rejects.toMatchObject({
      code: 'checkout_unavailable',
    })
  })

  it('reports a corrupt registry, grants nothing, and does not overwrite it', async () => {
    const alpha = await project('alpha', 'Alpha')
    const entry = await enable(alpha)
    await writeFile(registry, '{ "schema_version": 1, "checkouts": [', 'utf8')

    await expect(resolveEnabledCheckout(registry, entry.checkout_id)).rejects.toMatchObject({
      code: 'registry_unreadable',
    })
    await expect(describeEnabledCheckouts(registry)).rejects.toMatchObject({
      code: 'registry_unreadable',
    })
    await expect(enable(await project('beta', 'Beta'))).rejects.toMatchObject({
      code: 'registry_unreadable',
    })
    expect(await readFile(registry, 'utf8')).toBe('{ "schema_version": 1, "checkouts": [')
  })

  it('refuses a registry written by a newer version rather than guessing at it', async () => {
    await enable(await project('alpha', 'Alpha'))
    const stored = JSON.parse(await readFile(registry, 'utf8')) as Record<string, unknown>
    await writeFile(registry, JSON.stringify({ ...stored, schema_version: 2 }), 'utf8')

    await expect(readAccessRegistry(registry)).rejects.toMatchObject({
      code: 'registry_unreadable',
    })
  })

  it('finds the grant for a folder, for the desktop setting', async () => {
    const alpha = await project('alpha', 'Alpha')
    await project('beta', 'Beta')
    const entry = await enable(alpha)

    expect((await findEnabledCheckout(registry, alpha.root.path))?.checkout_id).toBe(
      entry.checkout_id,
    )
    expect(await findEnabledCheckout(registry, join(workspace, 'beta'))).toBeNull()
  })

  it('serializes concurrent grants so none is lost', async () => {
    const projects = await Promise.all(
      ['a', 'b', 'c', 'd'].map((name) => project(name, name.toUpperCase())),
    )
    await Promise.all(projects.map(enable))

    expect((await readAccessRegistry(registry)).checkouts).toHaveLength(4)
  })
})
