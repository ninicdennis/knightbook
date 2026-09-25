import { ipcMain } from 'electron'
import { createTicket, openProject, ticketTypeSchema } from '@knightbook/core'
import { guard } from '../guard.js'
import { buildView } from '../project/project-view.js'
import type { CreatedTicketView, NewTicketInput } from '../../shared/ticket-create-contract.js'

/**
 * Validates what the window sent before anything is written: the renderer is
 * not trusted to have checked the title or the type itself.
 */
export function parseNewTicket(input: unknown): NewTicketInput {
  const candidate = (input ?? {}) as Partial<Record<keyof NewTicketInput, unknown>>
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
  if (title === '') throw new Error('A ticket needs a title.')
  if (typeof candidate.body !== 'string') throw new Error('A ticket body must be text.')
  const type = candidate.type ?? null
  if (type !== null && !ticketTypeSchema.safeParse(type).success) {
    throw new Error('That is not one of the ticket types.')
  }
  return { title, type: type as NewTicketInput['type'], body: candidate.body }
}

export function registerTicketCreateHandler(): void {
  ipcMain.handle(
    'ticket:create',
    async (_event, rootPath: unknown, input: unknown) =>
      await guard<CreatedTicketView>(async () => {
        if (typeof rootPath !== 'string') throw new Error('A project path is required.')
        const { title, type, body } = parseNewTicket(input)

        const project = await openProject(rootPath)
        const created = await createTicket(project, {
          title,
          body,
          ...(type !== null ? { type } : {}),
        })
        return { id: created.frontmatter.id, project: await buildView(project) }
      }),
  )
}
