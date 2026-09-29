import {
  CheckIcon,
  Group,
  MultiSelect,
  Pill,
  Stack,
  Text,
  Tooltip,
  type ComboboxItem,
  type MultiSelectProps,
  type OptionsFilter,
} from '@mantine/core'

/**
 * A multi-select for a ticket's links that keeps one row whatever is chosen.
 * Only the first few choices show as pills; the rest collapse into one "+N"
 * pill, so choosing more never pushes the dialog's content down. Everything
 * chosen is ticked in the list, which is also where a hidden one is removed.
 */

/** Two capped pills, the "+N" pill and the search field fit one row of the dialog. */
const VISIBLE_PILLS = 2

interface Props {
  label: string
  /** Shown while nothing is chosen; once something is, the field just says "Add…". */
  placeholder: string
  data: ComboboxItem[]
  value: string[]
  onChange: (value: string[]) => void
  nothingFoundMessage: string
  disabled?: boolean
  error?: string
  renderOption?: MultiSelectProps['renderOption']
  filter?: OptionsFilter
}

export function LinkPicker({
  label,
  placeholder,
  data,
  value,
  onChange,
  nothingFoundMessage,
  disabled = false,
  error,
  renderOption,
  filter,
}: Props) {
  const labelOf = (item: string) => data.find((option) => option.value === item)?.label ?? item

  const renderPill: NonNullable<MultiSelectProps['renderPill']> = ({ option, onRemove }) => {
    const index = value.indexOf(String(option.value))
    if (index < VISIBLE_PILLS) {
      return (
        // Capped, and allowed to shrink further, so a long title ends in an
        // ellipsis rather than pushing the row onto a second line.
        <Pill
          withRemoveButton={!disabled}
          {...(onRemove ? { onRemove } : {})}
          // `auto`, because Mantine's own `flex: 0` starts a pill at no width,
          // which let the search field take every pixel and squeeze titles to "E…".
          style={{ maxWidth: '16rem', minWidth: '3rem', flex: '0 1 auto' }}
        >
          {option.label}
        </Pill>
      )
    }
    if (index > VISIBLE_PILLS) return null
    const hidden = value.slice(VISIBLE_PILLS)
    return (
      <Tooltip
        withArrow
        multiline
        maw={320}
        label={
          <Stack gap={2}>
            {hidden.map((item) => (
              <span key={item}>{labelOf(item)}</span>
            ))}
          </Stack>
        }
      >
        <Pill
          aria-label={`${hidden.length} more: ${hidden.map(labelOf).join(', ')}`}
          style={{ flex: '0 0 auto' }}
        >
          +{hidden.length}
        </Pill>
      </Tooltip>
    )
  }

  return (
    <MultiSelect
      label={label}
      nothingFoundMessage={nothingFoundMessage}
      disabled={disabled}
      {...(error === undefined ? {} : { error })}
      {...(renderOption === undefined ? {} : { renderOption })}
      {...(filter === undefined ? {} : { filter })}
      data={data}
      value={value}
      onChange={onChange}
      searchable
      placeholder={value.length === 0 ? placeholder : 'Add…'}
      renderPill={renderPill}
      // The list opens inside the dialog, so it stays within its focus trap and
      // scrolls with it; its height is capped so a long board scrolls inside it.
      comboboxProps={{ withinPortal: false }}
      maxDropdownHeight={200}
      // One line, always: the row never wraps, so the field keeps one height
      // whatever is chosen. The title pills give up width first; "+N" and the
      // search field keep theirs, so there is always room to type.
      //
      // `contain: inline-size` makes the field take its width from the dialog
      // and never the other way round. The dialog sizes itself to its content,
      // and a row that never wraps is as wide as all its pills end to end, so
      // without this each long title chosen made the whole dialog wider.
      style={{ contain: 'inline-size' }}
      styles={{
        pillsList: { flexWrap: 'nowrap', overflow: 'hidden' },
        inputField: { minWidth: '4rem', flex: '1 0 4rem' },
      }}
    />
  )
}

/*
 * A document is picked by title, because a full path such as
 * docs/decisions/0017-a-prerequisite-that-failed-….md fills a whole row as a
 * pill. The path is still shown in the list and matched by the search, so two
 * documents with one title can be told apart.
 */
export const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** Title over path, ticked when chosen, like the default options beside it. */
export const renderDocumentOption: NonNullable<MultiSelectProps['renderOption']> = ({
  option,
  checked,
}) => (
  <Group gap="xs" wrap="nowrap" align="flex-start">
    <span style={{ width: 12, flexShrink: 0, paddingTop: 4 }}>
      {checked && <CheckIcon size={12} aria-hidden="true" />}
    </span>
    <Stack gap={0}>
      <Text size="sm">{option.label}</Text>
      <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
        {option.value}
      </Text>
    </Stack>
  </Group>
)

export const matchTitleOrPath: OptionsFilter = ({ options, search }) => {
  const query = search.trim().toLowerCase()
  return options.filter(
    (option) =>
      'value' in option &&
      (option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)),
  )
}
