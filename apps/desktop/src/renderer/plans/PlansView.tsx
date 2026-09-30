import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Code,
  Loader,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconAlertTriangle, IconMap, IconPlus } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { PlansView as PlansListing } from '../../shared/plans-contract.js'
import type { LinkRequest } from '../markdown/useLinkNavigation.js'
import { PlanDetail } from './PlanDetail.js'
import { TitleDialog } from './TitleDialog.js'
import { usePlanEdits } from './usePlanEdits.js'

/**
 * The project's plans beside the one being read, laid out like Documents. On a
 * narrow window the list and the plan take turns. Plans are re-read whenever
 * the project refreshes, so a plan an AI just changed shows up on return.
 */

interface Props {
  rootPath: string
  /** Asks the view to show one plan. The nonce lets the same plan be asked for twice. */
  openTarget?: { id: string; nonce: number } | null
  refreshToken: number
  onOpenTicket: (id: string) => void
  onFollowLink: (request: LinkRequest) => Promise<string | null>
  onViewOnBoard: (planId: string) => void
  /** The user chose a plan from the list: a step in history. */
  onChoose?: (planId: string) => void
  /** The board's active tickets, which are what a phase can attach. */
  tickets?: readonly { id: string; title: string }[]
}

const NARROW_QUERY = '(max-width: 47.99em)'

type Loaded =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; listing: PlansListing }

function NoPlans({ onNewPlan }: { onNewPlan: () => void }) {
  return (
    <Center style={{ height: '100%' }}>
      <Stack gap="xs" align="center" maw={440} ta="center">
        <IconMap size={28} opacity={0.5} aria-hidden />
        <Text fw={600}>No plans yet</Text>
        <Text size="sm" c="var(--ps-text-muted)">
          A plan is a roadmap, such as an MVP or a launch, that groups tickets into phases. Create
          one here, or ask your AI tool to with <Code>plan_create</Code>. Progress is read from the
          tickets.
        </Text>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onNewPlan}>
          New plan
        </Button>
      </Stack>
    </Center>
  )
}

export function PlansView({
  rootPath,
  openTarget = null,
  refreshToken,
  onOpenTicket,
  onFollowLink,
  onViewOnBoard,
  onChoose,
  tickets = [],
}: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const narrow = useMediaQuery(NARROW_QUERY) ?? false
  const [pane, setPane] = useState<'list' | 'plan'>('list')
  const [creating, setCreating] = useState(false)
  const edits = usePlanEdits({
    rootPath,
    show: useCallback((listing: PlansListing) => setLoaded({ kind: 'ready', listing }), []),
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  })

  useEffect(() => {
    let cancelled = false
    void window.knightbook.listPlans(rootPath).then((result) => {
      if (cancelled) return
      // A failed re-read keeps the plans already on screen, and says so.
      setLoaded((current) =>
        result.ok
          ? { kind: 'ready', listing: result.value }
          : current.kind === 'ready'
            ? current
            : { kind: 'failed', message: result.message },
      )
    })
    return () => {
      cancelled = true
    }
  }, [rootPath, refreshToken, attempt])

  useEffect(() => {
    if (!openTarget) return
    setSelected(openTarget.id)
    setPane('plan')
  }, [openTarget])

  const choose = useCallback(
    (id: string) => {
      onChoose?.(id)
      setSelected(id)
      setPane('plan')
    },
    [onChoose],
  )

  if (loaded.kind === 'loading') {
    return (
      <Center style={{ height: '100%' }}>
        <Loader size="sm" aria-label="Loading plans" />
      </Center>
    )
  }
  if (loaded.kind === 'failed') {
    return (
      <Center style={{ height: '100%' }}>
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="red"
          title="Plans could not be read"
          maw={480}
        >
          <Stack gap="xs">
            <Text size="sm">{loaded.message}</Text>
            <Button size="xs" variant="default" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </Stack>
        </Alert>
      </Center>
    )
  }

  const { plans, problems } = loaded.listing
  const newPlanDialog = creating && (
    <TitleDialog
      heading="New plan"
      label="Plan title"
      action="Create plan"
      onClose={() => setCreating(false)}
      onSubmit={async (title) => {
        setCreating(false)
        const id = await edits.createPlan(title)
        if (id) choose(id)
      }}
    />
  )
  const editError = edits.error && (
    <Alert
      color="orange"
      variant="light"
      withCloseButton
      onClose={edits.clearError}
      icon={<IconAlertTriangle size={16} />}
      m="sm"
    >
      {edits.error}
    </Alert>
  )
  if (plans.length === 0 && problems.length === 0) {
    return (
      <>
        {editError}
        <NoPlans onNewPlan={() => setCreating(true)} />
        {newPlanDialog}
      </>
    )
  }

  const current = plans.find((plan) => plan.id === selected) ?? plans[0] ?? null
  const showList = !narrow || pane === 'list'
  const showPlan = current && (!narrow || pane === 'plan')

  return (
    <div className="ps-docs ps-reading" data-narrow={narrow || undefined}>
      {showList && (
        <nav className="ps-docs-nav" aria-label="Plans">
          <div className="ps-docs-nav-heading" style={{ alignItems: 'center', gap: 6 }}>
            <span>Plans</span>
            <Text span size="xs" c="var(--ps-text-muted)" style={{ marginInlineStart: 'auto' }}>
              {plans.length}
            </Text>
            <Tooltip label="New plan" withinPortal>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="New plan"
                disabled={edits.busy}
                onClick={() => setCreating(true)}
              >
                <IconPlus size={14} />
              </ActionIcon>
            </Tooltip>
          </div>
          {editError}
          <ul className="ps-docs-list">
            {plans.map((plan) => (
              <li key={plan.id}>
                <UnstyledButton
                  className="ps-docs-item"
                  aria-current={plan.id === current?.id ? 'true' : undefined}
                  onClick={() => choose(plan.id)}
                >
                  <span className="ps-docs-item-text">
                    <span className="ps-docs-item-title" style={{ display: 'block' }}>
                      {plan.title}
                    </span>
                    <span className="ps-docs-path" style={{ display: 'block' }}>
                      <span>
                        {plan.progress.state === 'empty'
                          ? 'Nothing planned yet'
                          : `${plan.progress.byStatus.done} of ${plan.progress.total} done`}
                      </span>
                    </span>
                  </span>
                </UnstyledButton>
              </li>
            ))}
          </ul>
          {problems.length > 0 && (
            <Alert color="orange" variant="light" m="sm" title="Some plans could not be read">
              {problems.map((problem) => (
                <Text key={problem.file} size="xs">
                  {problem.file}: {problem.reason}
                </Text>
              ))}
            </Alert>
          )}
        </nav>
      )}

      {showPlan && (
        <PlanDetail
          rootPath={rootPath}
          plan={current}
          onOpenTicket={onOpenTicket}
          onFollowLink={onFollowLink}
          onViewOnBoard={onViewOnBoard}
          {...(narrow ? { onBack: () => setPane('list') } : {})}
          tickets={tickets}
          busy={edits.busy}
          onSavePhases={(phases) => void edits.savePhases(current.id, current.revision, phases)}
        />
      )}
      {newPlanDialog}
    </div>
  )
}
