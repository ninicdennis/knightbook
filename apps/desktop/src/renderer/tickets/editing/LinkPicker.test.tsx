import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LinkPicker, matchTitleOrPath, renderDocumentOption } from './LinkPicker.js'

/**
 * The picker keeps one row however much is chosen: two pills, then "+N". What is
 * hidden behind "+N" is still ticked in the list, which is where it is removed.
 */

const DOCUMENTS = ['a', 'b', 'c', 'd'].map((name) => ({
  value: `docs/${name}.md`,
  label: name.toUpperCase(),
}))

function Harness({ initial, onChange }: { initial: string[]; onChange: (v: string[]) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <LinkPicker
      label="Related documents"
      placeholder="Search included documents"
      nothingFoundMessage="No included document matches."
      data={DOCUMENTS}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      renderOption={renderDocumentOption}
      filter={matchTitleOrPath}
    />
  )
}

function renderPicker(initial: string[]) {
  const onChange = vi.fn()
  const { container } = render(
    <MantineProvider env="test" theme={{ respectReducedMotion: true }}>
      <Harness initial={initial} onChange={onChange} />
    </MantineProvider>,
  )
  const pills = () =>
    [...container.querySelectorAll('.mantine-Pill-label')].map((pill) => pill.textContent)
  const field = screen
    .getAllByLabelText('Related documents')
    .find((element) => element.getAttribute('aria-haspopup') === 'listbox')!
  return { onChange, pills, field }
}

describe('the link picker', () => {
  it('shows every choice as a pill while there are two or fewer', () => {
    const { pills, field } = renderPicker(['docs/a.md', 'docs/b.md'])

    expect(pills()).toEqual(['A', 'B'])
    expect(field.getAttribute('placeholder')).toBe('Add…')
  })

  it('collapses the rest into one "+N" pill that names them', () => {
    const { pills } = renderPicker(DOCUMENTS.map((d) => d.value))

    expect(pills()).toEqual(['A', 'B', '+2'])
    expect(screen.getByLabelText('2 more: C, D')).toBeTruthy()
  })

  it('takes its width from the dialog, so long choices cannot widen it', () => {
    // The dialog sizes itself to its content, and a one-line row of pills is as
    // wide as all of them end to end; jsdom cannot lay that out, so this pins
    // the containment that stops it (measured in the preview: 709px without it).
    const { field } = renderPicker(DOCUMENTS.map((d) => d.value))

    const root = field.closest<HTMLElement>('.mantine-MultiSelect-root')!
    expect(root.style.contain).toBe('inline-size')
  })

  it('asks what to search for only while nothing is chosen', () => {
    const { field } = renderPicker([])

    expect(field.getAttribute('placeholder')).toBe('Search included documents')
  })

  it('ticks every choice in the list, and removes a hidden one from there', async () => {
    const user = userEvent.setup()
    const { onChange, pills, field } = renderPicker(DOCUMENTS.map((d) => d.value))

    await user.click(field)
    const ticked = screen.getAllByRole('option').filter((option) => option.querySelector('svg'))
    expect(ticked).toHaveLength(4)

    await user.click(screen.getByRole('option', { name: /docs\/d\.md/ }))

    await waitFor(() => expect(pills()).toEqual(['A', 'B', '+1']))
    expect(onChange).toHaveBeenLastCalledWith(['docs/a.md', 'docs/b.md', 'docs/c.md'])
  })

  it('does not tick what is not chosen', async () => {
    const user = userEvent.setup()
    const { field } = renderPicker(['docs/a.md'])

    await user.click(field)
    const ticked = screen.getAllByRole('option').filter((option) => option.querySelector('svg'))
    expect(ticked).toHaveLength(1)
  })
})
