import {
  isArchived,
  planProgress,
  RESERVED_DIR,
  type Plan,
  type PlanListing,
  type Progress,
  type TicketListing,
} from '@knightbook/core'
import type {
  PlanTicketView,
  PlansView,
  PlanView,
  ProgressView,
} from '../../shared/plans-contract.js'

/** Plans for the window, with progress from core and each reference resolved. */

function toProgress(progress: Progress): ProgressView {
  return {
    total: progress.total,
    byStatus: { ...progress.byStatus },
    unattributedDone: progress.unattributedDone,
    missing: [...progress.missing],
    unreadable: [...progress.unreadable],
    state: progress.state,
  }
}

function toPlanView(plan: Plan, tickets: TicketListing): PlanView {
  const progress = planProgress(plan.frontmatter, tickets)
  const byId = new Map(tickets.tickets.map((ticket) => [ticket.frontmatter.id, ticket]))
  const unreadable = new Set(tickets.problems.map((problem) => problem.id))

  const ref = (id: string): PlanTicketView => {
    const ticket = byId.get(id)
    if (ticket) {
      return {
        id,
        title: ticket.frontmatter.title,
        status: ticket.frontmatter.status,
        archived: isArchived(ticket),
        problem: null,
      }
    }
    return {
      id,
      title: null,
      status: null,
      archived: false,
      problem: unreadable.has(id) ? 'unreadable' : 'missing',
    }
  }

  return {
    id: plan.frontmatter.id,
    title: plan.frontmatter.title,
    body: plan.body,
    file: `${RESERVED_DIR}/plans/${plan.frontmatter.id}.md`,
    revision: plan.revision,
    progress: toProgress(progress),
    phases: plan.frontmatter.phases.map((phase, index) => ({
      id: phase.id,
      title: phase.title,
      scope: phase.scope ?? null,
      value: phase.value ?? null,
      progress: toProgress(progress.phases[index]!),
      tickets: phase.tickets.map(ref),
    })),
  }
}

export function toPlansView(plans: PlanListing, tickets: TicketListing): PlansView {
  return {
    plans: plans.plans.map((plan) => toPlanView(plan, tickets)),
    problems: plans.problems.map((problem) => ({ file: problem.file, reason: problem.reason })),
  }
}
