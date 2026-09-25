import { Button } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'

/** Where a followed link came from, with the one step back to it. */
export interface BackTarget {
  label: string
  onBack: () => void
}

/** A quiet way back to the document or ticket a link was followed from. */
export function BackToSource({ back }: { back: BackTarget | null }) {
  if (!back) return null
  return (
    <Button
      size="compact-xs"
      variant="subtle"
      leftSection={<IconArrowLeft size={14} />}
      onClick={back.onBack}
      style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
      styles={{ label: { overflow: 'hidden', textOverflow: 'ellipsis' } }}
    >
      Back to {back.label}
    </Button>
  )
}
