import { useDisclosure } from '@mantine/hooks'
import { useCallback, useState } from 'react'
import type { NewTicketInput } from '../../shared/ticket-create-contract.js'
import type { ScreenControls } from '../screen.js'

/**
 * Creating a ticket from the board. Unlike the other board actions a failure
 * keeps the form open with its reason, so what the user typed is not lost.
 * On success the board is replaced with what the files now say and the new
 * ticket opens in the detail view.
 */
export function useNewTicket(
  { screen, setScreen }: Pick<ScreenControls, 'screen' | 'setScreen'>,
  openTicket: (id: string) => void,
) {
  const [opened, dialog] = useDisclosure(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = useCallback(() => {
    setError(null)
    dialog.open()
  }, [dialog])

  const create = useCallback(
    async (input: NewTicketInput) => {
      if (screen.kind !== 'open') return
      const path = screen.path
      setSaving(true)
      setError(null)

      const result = await window.knightbook.createTicket(path, input)
      setSaving(false)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setScreen((current) =>
        current.kind === 'open' && current.path === path
          ? { kind: 'open', path, project: result.value.project }
          : current,
      )
      dialog.close()
      openTicket(result.value.id)
    },
    [screen, setScreen, dialog, openTicket],
  )

  return {
    opened,
    saving,
    error,
    open,
    close: dialog.close,
    create: (input: NewTicketInput) => void create(input),
  }
}
