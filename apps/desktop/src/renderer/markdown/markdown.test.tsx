import { describe, expect, it } from 'vitest'
import { classifyLink, headingIdFor, renderMarkdown, splitFrontmatter } from './markdown.js'

/**
 * Technical design section 1: document content is untrusted. These cover the
 * refusal cases directly, because a link classified wrongly is the difference
 * between a readable document and an app a document can drive.
 */

describe('link classification', () => {
  it('resolves a relative link from the file it appears in', () => {
    expect(classifyLink('architecture.md', 'docs/overview.md')).toEqual({
      kind: 'internal',
      path: 'docs/architecture.md',
      fragment: null,
    })
  })

  it('resolves a parent-relative link within the project', () => {
    expect(classifyLink('../README.md', 'docs/overview.md')).toEqual({
      kind: 'internal',
      path: 'README.md',
      fragment: null,
    })
  })

  it('resolves links from a ticket file to documents and to a sibling ticket', () => {
    const ticket = '.projectspace/tickets/5be60610.md'
    expect(classifyLink('../../docs/research/ui-ux-design-direction.md', ticket)).toEqual({
      kind: 'internal',
      path: 'docs/research/ui-ux-design-direction.md',
      fragment: null,
    })
    expect(classifyLink('db7cff48.md', ticket)).toEqual({
      kind: 'internal',
      path: '.projectspace/tickets/db7cff48.md',
      fragment: null,
    })
  })

  it('keeps a fragment on a cross-file link and treats a bare one as this file', () => {
    expect(classifyLink('spec.md#Next-decisions', 'docs/overview.md')).toEqual({
      kind: 'internal',
      path: 'docs/spec.md',
      fragment: 'Next-decisions',
    })
    expect(classifyLink('#acceptance-criteria', 'README.md')).toEqual({
      kind: 'anchor',
      fragment: 'acceptance-criteria',
    })
  })

  it('decodes spaces and escapes exactly once', () => {
    expect(classifyLink('design%20notes.md', 'docs/a.md')).toMatchObject({
      path: 'docs/design notes.md',
    })
    // %2520 is a literal "%20" in the file name, not a space.
    expect(classifyLink('odd%2520name.md', 'docs/a.md')).toMatchObject({
      path: 'docs/odd%20name.md',
    })
  })

  it('refuses escaped separators, malformed escapes, and Windows paths', () => {
    for (const href of ['..%2F..%2Fsecret.md', 'bad%zz.md', 'docs\\x.md', 'C:/x.md']) {
      expect(classifyLink(href, 'docs/a.md').kind, href).toBe('blocked')
    }
  })

  it('blocks a link that climbs out of the project', () => {
    expect(classifyLink('../../secrets.md', 'docs/overview.md').kind).toBe('blocked')
    expect(classifyLink('../../../etc/passwd', 'docs/overview.md').kind).toBe('blocked')
  })

  it('allows http and https', () => {
    expect(classifyLink('https://modelcontextprotocol.io', 'README.md')).toEqual({
      kind: 'external',
      url: 'https://modelcontextprotocol.io',
    })
    expect(classifyLink('http://example.com', 'README.md').kind).toBe('external')
  })

  it('blocks every other scheme', () => {
    for (const href of [
      'file:///C:/Windows/System32/config',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'knightbook://do-something',
      '//evil.example.com',
      '/etc/passwd',
    ]) {
      expect(classifyLink(href, 'README.md').kind, href).toBe('blocked')
    }
  })

  it('blocks an empty link or an empty fragment rather than guessing', () => {
    expect(classifyLink('#', 'README.md').kind).toBe('blocked')
    expect(classifyLink('   ', 'README.md').kind).toBe('blocked')
  })
})

describe('rendering', () => {
  it('separates frontmatter from the body instead of rendering it as prose', () => {
    const split = splitFrontmatter('---\ntitle: Notes\n---\n\n# Notes\n')
    expect(split.frontmatter.trim()).toBe('title: Notes')
    expect(split.body.trim()).toBe('# Notes')
  })

  it('renders headings, lists, tables, and code', () => {
    const { html } = renderMarkdown(
      '# Title\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```ts\nconst x = 1\n```\n',
      'README.md',
    )
    expect(html).toContain('<h1 id="user-content-title">Title</h1>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<table>')
    expect(html).toContain('const x = 1')
  })

  it('strips scripts and event handlers from document content', () => {
    const { html } = renderMarkdown(
      '<script>alert(1)</script>\n\n<div onclick="alert(2)">text</div>\n\n<img src=x onerror="alert(3)">\n',
      'README.md',
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('alert(')
  })

  it('makes links inert, carrying the target as data for the app to resolve', () => {
    const { html } = renderMarkdown(
      '[docs](docs/architecture.md) and [site](https://example.com)',
      'README.md',
    )
    expect(html).toContain('data-link="docs/architecture.md"')
    expect(html).toContain('data-external="https://example.com"')
    // No href can navigate on its own.
    expect(html).not.toContain('href="https://example.com"')
    expect(html).not.toContain('href="docs/architecture.md"')
  })

  it('gives headings GitHub-style ids, numbering repeats', () => {
    const { html } = renderMarkdown(
      '## Acceptance criteria\n\n## Notes\n\n## Notes\n\n## What’s **next**?\n',
      'README.md',
    )
    expect(html).toContain('id="user-content-acceptance-criteria"')
    expect(html).toContain('id="user-content-notes"')
    expect(html).toContain('id="user-content-notes-1"')
    expect(html).toContain('id="user-content-whats-next"')
    expect(headingIdFor('Acceptance Criteria')).toBe('user-content-acceptance-criteria')
  })

  it('carries a fragment as data, never as a live href', () => {
    const { html } = renderMarkdown('[a](spec.md#notes) and [b](#notes)', 'docs/x.md')
    expect(html).toContain('data-link="docs/spec.md" data-fragment="notes"')
    expect(html).toContain('<a href="#" data-fragment="notes">b</a>')
  })

  it('shows a refused link as visible text rather than dropping it', () => {
    const { html } = renderMarkdown('[open it](javascript:alert(1))', 'README.md')
    expect(html).toContain('blocked-link')
    expect(html).toContain('open it')
    // The raw URL may appear as inert title text (so the user can see what was
    // refused), but it must never be a live, clickable href.
    expect(html).not.toMatch(/href="[^"]*javascript:/i)
  })

  it('does not fetch images', () => {
    const { html } = renderMarkdown('![a diagram](https://example.com/x.png)', 'README.md')
    expect(html).toContain('blocked-image')
    expect(html).not.toContain('<img')
  })

  it('keeps an iframe or object out of the output entirely', () => {
    const { html } = renderMarkdown(
      '<iframe src="https://example.com"></iframe>\n\n<object data="x"></object>\n',
      'README.md',
    )
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<object')
  })
})

/**
 * Images (ticket 90e1db82). Rendering never produces a live <img>: an
 * in-project path becomes a placeholder the host may fill after its checks, and
 * everything else stays a note that says why it was not shown.
 */
describe('images', () => {
  function placeholders(source: string, fromPath = 'docs/guide.md') {
    const container = document.createElement('div')
    container.innerHTML = renderMarkdown(source, fromPath).html
    return {
      container,
      images: Array.from(container.querySelectorAll<HTMLElement>('[data-image]')),
      blocked: Array.from(container.querySelectorAll<HTMLElement>('.blocked-image')),
    }
  }

  it('resolves a Markdown image against the file it appears in', () => {
    const { container, images } = placeholders('![The logo](assets/logo.png)')

    expect(images.map((image) => image.getAttribute('data-image'))).toEqual([
      'docs/assets/logo.png',
    ])
    expect(images[0]!.getAttribute('data-image-alt')).toBe('The logo')
    expect(container.querySelector('img')).toBeNull()
  })

  it('resolves a raw HTML <img> the same way, keeping a plain pixel width', () => {
    const { images } = placeholders(
      '<img src="docs/assets/knightbook-logo.png" alt="Knightbook" width="192" />',
      'README.md',
    )

    expect(images[0]!.getAttribute('data-image')).toBe('docs/assets/knightbook-logo.png')
    expect(images[0]!.getAttribute('data-image-width')).toBe('192')
  })

  it('resolves an image in a ticket body from the ticket file', () => {
    const { images } = placeholders(
      '![Screenshot](../../docs/shots/board.png)',
      '.projectspace/tickets/abc.md',
    )

    expect(images[0]!.getAttribute('data-image')).toBe('docs/shots/board.png')
  })

  it('drops a width that is not a plain number', () => {
    const { images } = placeholders('<img src="a.png" width="100%" height="10;x:y">')

    expect(images[0]!.hasAttribute('data-image-width')).toBe(false)
    expect(images[0]!.hasAttribute('data-image-height')).toBe(false)
  })

  it('never requests a remote image, saying so', () => {
    for (const src of [
      'https://example.com/x.png',
      'http://example.com/x.png',
      '//example.com/x.png',
    ]) {
      const { images, blocked } = placeholders(`<img src="${src}" alt="remote">`)
      expect(images, src).toEqual([])
      expect(blocked[0]!.textContent, src).toContain('remote images are not loaded')
    }
  })

  it('refuses data:, file:, absolute and escaping paths, saying so', () => {
    for (const src of [
      'data:image/png;base64,iVBORw0KGgo=',
      'file:///C:/Windows/logo.png',
      '/etc/logo.png',
      '../../../outside.png',
    ]) {
      const { images, blocked } = placeholders(`![x](${src})`)
      expect(images, src).toEqual([])
      expect(blocked[0]!.textContent, src).toContain('only images inside this project are shown')
    }
  })

  it('leaves an in-project SVG to the host, which refuses it by its content', () => {
    const { images } = placeholders('![icon](assets/icon.svg)')

    expect(images[0]!.getAttribute('data-image')).toBe('docs/assets/icon.svg')
  })

  it('turns an uppercase raw <IMG> into a placeholder too', () => {
    const { container, images } = placeholders('<IMG SRC="assets/logo.png" ALT="Logo">')

    expect(images).toHaveLength(1)
    expect(container.querySelector('img')).toBeNull()
  })
})
