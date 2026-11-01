import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import { applyThemeSnapshot } from './lib/theme'
import { listenForInstall } from './lib/pwa'

applyThemeSnapshot()
listenForInstall()
// Service worker: precaches the app shell so every screen works offline after the first visit.
registerSW({ immediate: true })
// Ask the browser not to evict IndexedDB under storage pressure.
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
