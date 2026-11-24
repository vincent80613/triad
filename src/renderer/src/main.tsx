import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/base.css'
import './styles/components.css'
import './styles/pages.css'
import './styles/features.css'
import './styles/skin-changer.css'
import './styles/hosting.css'
import './styles/motion.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
