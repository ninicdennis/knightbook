import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { getMarkdown, replaceAll } from '@milkdown/kit/utils'
import { splitFrontmatter, joinFrontmatter } from './frontmatter.js'

/**
 * Loads Markdown into a real Milkdown editor and reads it back out, which is the
 * path a saved document would actually take. Serialization differences that show
 * up here are the ones a user would find in their Git diff.
 */
export async function roundTripBody(markdown: string): Promise<string> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, markdown)
    })
    .use(commonmark)
    .use(gfm)
    .create()

  try {
    return editor.action(getMarkdown())
  } finally {
    await editor.destroy(true)
    root.remove()
  }
}

/** Round-trips a whole document with frontmatter held outside the editor. */
export async function roundTripDocument(source: string): Promise<string> {
  const split = splitFrontmatter(source)
  const body = await roundTripBody(split.body)
  return joinFrontmatter({ frontmatter: split.frontmatter, body })
}

/**
 * Simulates a deliberate edit: load the document, replace the body with an edited
 * version through the editor's own transform path, then serialize. This is the
 * "small supported edit preserves unrelated content" case from section 11.
 */
export async function editThenSerialize(
  source: string,
  edit: (body: string) => string,
): Promise<string> {
  const split = splitFrontmatter(source)
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, split.body)
    })
    .use(commonmark)
    .use(gfm)
    .create()

  try {
    editor.action(replaceAll(edit(split.body)))
    const body = editor.action(getMarkdown())
    return joinFrontmatter({ frontmatter: split.frontmatter, body })
  } finally {
    await editor.destroy(true)
    root.remove()
  }
}
