import type { ProjectView, Result, TicketType } from './contract.js'

/**
 * Creating a ticket from the board. The host writes it through the same core
 * `createTicket` MCP's `ticket_create` uses, so a ticket made here and one made
 * by an AI tool are the same kind of record, in Backlog, behind every ticket
 * the manual order already places.
 */

export interface NewTicketInput {
  /** Required; a title of only whitespace is refused. */
  title: string
  /** Null leaves the ticket untyped. */
  type: TicketType | null
  /** The whole Markdown body, written as given. */
  body: string
}

export interface CreatedTicketView {
  id: string
  /** The board as the files now say, including the new ticket. */
  project: ProjectView
}

export interface TicketCreateApi {
  createTicket(rootPath: string, input: NewTicketInput): Promise<Result<CreatedTicketView>>
}
