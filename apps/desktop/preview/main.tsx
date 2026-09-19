import '@mantine/core/styles.css'
import { MantineProvider } from '@mantine/core'
import { createRoot } from 'react-dom/client'
import { App } from '../src/renderer/App.js'
import { theme } from '../src/renderer/theme.js'
import { stubApi } from './stub-api.js'

/**
 * Renders the real board against stub data so the layout can be reviewed in a
 * browser without packaging the desktop app. Not part of the shipped build.
 */
window.projectspace = stubApi

createRoot(document.getElementById('root')!).render(
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <App />
  </MantineProvider>,
)
