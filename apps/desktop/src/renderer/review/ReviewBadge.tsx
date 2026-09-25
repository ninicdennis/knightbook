import { Badge, Tooltip } from '@mantine/core'
import { IconEye, IconEyeOff } from '@tabler/icons-react'
import type { ReviewView } from '../../shared/contract.js'

/**
 * The three review states are deliberately distinct: content nobody has read must
 * never look the same as content whose review has gone stale.
 */
export function ReviewBadge({ review }: { review: ReviewView }) {
  if (review.state === 'reviewed') {
    return (
      <Badge size="xs" variant="light" color="teal" leftSection={<IconEye size={11} />}>
        Reviewed by you
      </Badge>
    )
  }

  if (review.state === 'changed_since_review') {
    return (
      <Tooltip multiline w={300} withArrow label={review.changeSummary ?? ''}>
        <Badge size="xs" variant="light" color="yellow" leftSection={<IconEye size={11} />}>
          Changed since review
        </Badge>
      </Tooltip>
    )
  }

  return (
    <Badge size="xs" variant="outline" color="gray" leftSection={<IconEyeOff size={11} />}>
      Unreviewed
    </Badge>
  )
}
