import type { ProjectView } from '../../shared/contract.js'
import { ArchiveView } from '../board/ArchiveView.js'
import { Board } from '../board/Board.js'
import { rememberPlanFilter } from '../board/usePlanFilter.js'
import type { useArchiveActions } from '../board/useArchiveActions.js'
import { DocumentsView } from '../documents/DocumentsView.js'
import type { BackTarget } from '../markdown/BackToSource.js'
import type { useLinkNavigation } from '../markdown/useLinkNavigation.js'
import { PlansView } from '../plans/PlansView.js'
import type { useTicketActions } from '../tickets/useTicketActions.js'
import type { useProjectNavigation } from './useProjectNavigation.js'

interface Props {
  rootPath: string
  project: ProjectView
  busyTicketId: string | null
  refreshToken: number
  navigation: ReturnType<typeof useProjectNavigation>
  links: ReturnType<typeof useLinkNavigation>
  /** The link-style way back, when the previous place was a document or ticket. */
  backTarget: BackTarget | null
  actions: ReturnType<typeof useTicketActions>
  archive: ReturnType<typeof useArchiveActions>
  onNewTicket: () => void
}

/** The open project's current view: the board, its documents, plans, or archive. */
export function ProjectViewSwitch({
  rootPath,
  project,
  busyTicketId,
  refreshToken,
  navigation,
  links,
  backTarget,
  actions,
  archive,
  onNewTicket,
}: Props) {
  switch (navigation.view) {
    case 'documents':
      return (
        <DocumentsView
          rootPath={rootPath}
          openTarget={navigation.documentTarget}
          refreshToken={refreshToken}
          onFollowLink={(_path, request) => links.follow(request)}
          back={backTarget}
          onChoose={(path) => navigation.openDocument(path)}
          onShowing={navigation.recordDocument}
        />
      )
    case 'plans':
      return (
        <PlansView
          rootPath={rootPath}
          openTarget={navigation.planTarget}
          refreshToken={refreshToken}
          onOpenTicket={navigation.openTicket}
          onFollowLink={links.follow}
          onChoose={navigation.openPlan}
          tickets={project.tickets}
          onViewOnBoard={(planId) => {
            rememberPlanFilter(project.checkoutPath, { kind: 'plan', id: planId })
            navigation.setView('board')
          }}
        />
      )
    case 'archive':
      return (
        <ArchiveView
          tickets={project.archivedTickets}
          busyTicketId={busyTicketId}
          onOpen={navigation.openTicket}
          onRestore={actions.restore}
        />
      )
    default:
      return (
        <Board
          project={project}
          busyTicketId={busyTicketId}
          onMove={actions.move}
          onComplete={actions.askToComplete}
          onReorder={actions.reorder}
          onReportIssue={actions.askAboutIssue}
          onResolveIssue={actions.resolveIssue}
          onReview={actions.review}
          onOpen={navigation.openTicket}
          onArchive={archive.archiveOne}
          onArchiveColumn={archive.askToArchiveColumn}
          onNewTicket={onNewTicket}
        />
      )
  }
}
