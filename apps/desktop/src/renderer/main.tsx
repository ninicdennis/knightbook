import '@mantine/core/styles.css'
import './markdown.css'
import './surfaces.css'
import './shell.css'
import './documents.css'
import './components.css'
import { MantineProvider } from '@mantine/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { hostColorSchemeManager } from './color-scheme.js'
import { cssVariablesResolver, theme } from './theme.js'
import type { ColorSchemeChoice } from '../shared/contract.js'

/**
 * The host owns the colour-scheme choice, so it is read before the first render.
 * Rendering first and correcting afterwards would show a flash of the other
 * scheme, which is the thing the window background is already set up to avoid.
 */
function start(colorScheme: ColorSchemeChoice): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        defaultColorScheme={colorScheme}
        colorSchemeManager={hostColorSchemeManager(colorScheme)}
      >
        <App />
      </MantineProvider>
    </StrictMode>,
  )
}

window.knightbook.readSettings().then(
  (settings) => start(settings.colorScheme),
  // An unreadable setting must not leave a blank window: follow the system.
  () => start('auto'),
)
