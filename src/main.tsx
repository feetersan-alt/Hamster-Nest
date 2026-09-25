import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import './styles/ui.css'
import App from './App.tsx'
import ConsentPage from './pages/ConsentPage'
import { initializeAppServiceWorker } from './lib/serviceWorker'

const noFxEnabled =
  new URLSearchParams(window.location.search).get('noFx') === '1' ||
  import.meta.env.VITE_NO_FX === '1'

if (noFxEnabled) {
  document.documentElement.classList.add('no-fx')
}

const isOAuthConsentPath = window.location.pathname.endsWith('/oauth/consent')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isOAuthConsentPath ? <ConsentPage /> : <HashRouter><App /></HashRouter>}
  </StrictMode>,
)

initializeAppServiceWorker()
