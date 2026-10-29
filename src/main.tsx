import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@fontsource-variable/geist/index.css'
import '@fontsource-variable/geist-mono/index.css'
import './styles/tokens.css'
import App from './App.tsx'
import { Showcase } from './mascot/Showcase.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {import.meta.env.DEV && location.search.includes('mascots') ? <Showcase /> : <App />}
  </StrictMode>,
)
