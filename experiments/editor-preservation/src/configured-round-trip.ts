import { Editor, defaultValueCtx, remarkStringifyOptionsCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm, remarkGFMPlugin } from '@milkdown/kit/preset/gfm'
import { getMarkdown } from '@milkdown/kit/utils'
import { joinFrontmatter, splitFrontmatter } from './frontmatter.js'

/**
 * The same round trip, but with the serializer configured to match the
 * conventions our own documents already use. This separates rewrites that are
 * merely the library's default style from rewrites we cannot turn off.
 */
export async function roundTripConfigured(source: string): Promise<string> {
  const split = splitFrontmatter(source)
  const root = document.createElement('div')
  document.body.appendChild(root)

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, split.body)
      ctx.set(remarkStringifyOptionsCtx, {
        bullet: '-',
        emphasis: '*',
        strong: '*',
        fence: '`',
        fences: true,
        rule: '-',
        listItemIndent: 'one',
      })
    })
    .config((ctx) => {
      ctx.update(remarkGFMPlugin.options.key, () => ({
        tablePipeAlign: false,
        tableCellPadding: true,
      }))
    })
    .use(commonmark)
    .use(gfm)
    .create()

  try {
    const body = editor.action(getMarkdown())
    return joinFrontmatter({ frontmatter: split.frontmatter, body })
  } finally {
    await editor.destroy(true)
    root.remove()
  }
}
