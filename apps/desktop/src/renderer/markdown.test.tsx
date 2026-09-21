import { describe, expect, it } from 'vitest'
import { classifyLink, renderMarkdown, splitFrontmatter } from './markdown.js'

/**
 * Technical design section 1: document content is untrusted. These cover the
 * refusal cases directly, because a link classified wrongly is the difference
 * between a readable document and an app a document can drive.
 */

describe('link classification', () => {
  it('treats a relative Markdown link as an in-project document', () => {
    expect(classifyLink('architecture.md', 'docs/overview.md')).toEqual({
      kind: 'document',
      path: 'docs/architecture.md',
    })
  })

  it('resolves a parent-relative link within the project', () => {
    expect(classifyLink('../README.md', 'docs/overview.md')).toEqual({
      kind: 'document',
      path: 'README.md',
    })
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

  it('blocks an anchor-only or empty link rather than guessing', () => {
    expect(classifyLink('#section', 'README.md').kind).toBe('blocked')
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
    expect(html).toContain('<h1>Title</h1>')
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
    expect(html).toContain('data-document="docs/architecture.md"')
    expect(html).toContain('data-external="https://example.com"')
    // No href can navigate on its own.
    expect(html).not.toContain('href="https://example.com"')
    expect(html).not.toContain('href="docs/architecture.md"')
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
