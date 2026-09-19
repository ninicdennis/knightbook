import '@mantine/core/styles.css'
import './markdown.css'
import { MantineProvider } from '@mantine/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { theme } from './theme.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
)
