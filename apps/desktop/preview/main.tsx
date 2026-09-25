import '@mantine/core/styles.css'
import '../src/renderer/markdown/markdown.css'
import '../src/renderer/theme/surfaces.css'
import '../src/renderer/review/review-changes.css'
import '../src/renderer/app/shell.css'
import '../src/renderer/documents/documents.css'
import '../src/renderer/plans/plans.css'
import '../src/renderer/theme/components.css'
import { MantineProvider } from '@mantine/core'
import { createRoot } from 'react-dom/client'
import { App } from '../src/renderer/App.js'
import { hostColorSchemeManager } from '../src/renderer/theme/color-scheme.js'
import { cssVariablesResolver, theme } from '../src/renderer/theme/theme.js'
import { stubApi } from './stub-api.js'

/**
 * Renders the real board against stub data so the layout can be reviewed in a
 * browser without packaging the desktop app. Not part of the shipped build.
 *
 * It starts from the same stored-settings read the real renderer does, so both
 * colour schemes can be reviewed here.
 */
window.knightbook = stubApi

void stubApi.readSettings().then((settings) => {
  createRoot(document.getElementById('root')!).render(
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme={settings.colorScheme}
      colorSchemeManager={hostColorSchemeManager(settings.colorScheme)}
    >
      <App />
    </MantineProvider>,
  )
})
