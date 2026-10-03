import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'
import { pathToFileURL } from 'node:url'

/**
 * The public guides: the only Markdown the site publishes. They come from one
 * folder, `src/content/docs/`, never from the repository's internal `docs/`
 * (specifications, research and proposals describe unfinished work; spec §9).
 *
 * The tests build from fixture guides named by KNIGHTBOOK_DOCS_DIR_FOR_TESTS, to
 * prove a broken link fails the build. Nothing else sets it.
 */
const testDocsDir = process.env.KNIGHTBOOK_DOCS_DIR_FOR_TESTS

// An absolute test folder goes in as a file:// URL: a Windows path such as
// C:\… would otherwise be read as a URL with the scheme "c:".
export const DOCS_DIR = testDocsDir ? pathToFileURL(`${testDocsDir}/`) : './src/content/docs'

export const GUIDE_GROUPS = ['Start here', 'Everyday use', 'AI setup', 'Troubleshooting'] as const

const docs = defineCollection({
  loader: glob({ pattern: '*.md', base: DOCS_DIR }),
  schema: z
    .object({
      title: z.string().min(1),
      description: z.string().min(1),
      group: z.enum(GUIDE_GROUPS),
      order: z.int().nonnegative(),
      /** A placeholder: marked as a draft in previews and left out of a production build. */
      draft: z.boolean().default(false),
      /** The Knightbook version the guide was written against, such as "0.2.0". */
      appVersion: z
        .string()
        .regex(/^\d+\.\d+\.\d+$/)
        .optional(),
    })
    .strict()
    .refine((guide) => guide.draft || guide.appVersion, {
      message: 'a published guide must say which app version it was written against (appVersion)',
      path: ['appVersion'],
    }),
})

export const collections = { docs }
