/**
 * Starting points for a new document. Each is ordinary Markdown the user edits
 * or deletes freely: nothing reads these headings back, and no document is ever
 * checked against a template (D-010). A title comes from the file name.
 */

export type TemplateId = 'blank' | 'project' | 'specification' | 'decision'

export const TEMPLATES: { id: TemplateId; label: string; description: string }[] = [
  { id: 'blank', label: 'Blank', description: 'Just a title.' },
  {
    id: 'project',
    label: 'Project definition',
    description: 'Purpose, scope and how you will know it works.',
  },
  {
    id: 'specification',
    label: 'Specification',
    description: 'The problem, requirements, exclusions and open questions.',
  },
  {
    id: 'decision',
    label: 'Decision record',
    description: 'Context, the decision, and its consequences, dated.',
  },
]

/** "release-notes.md" reads as "Release notes". */
export function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim()
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : 'Untitled'
}

export function templateContent(id: TemplateId, title: string, today: string): string {
  switch (id) {
    case 'blank':
      return `# ${title}\n`
    case 'project':
      return [
        `# ${title}`,
        '',
        '## Purpose',
        '',
        'What this project is for, and who it serves.',
        '',
        '## Scope',
        '',
        'What is in, and what is deliberately left out.',
        '',
        '## How we will know it works',
        '',
        '',
      ].join('\n')
    case 'specification':
      return [
        `# ${title}`,
        '',
        '## Problem',
        '',
        '## Requirements',
        '',
        '## Out of scope',
        '',
        '## Open questions',
        '',
      ].join('\n')
    case 'decision':
      return [
        `# ${title}`,
        '',
        `Date: ${today}`,
        'Status: proposed',
        '',
        '## Context',
        '',
        '## Decision',
        '',
        '## Consequences',
        '',
      ].join('\n')
  }
}
