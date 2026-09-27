import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the production app from /Hamster-Nest/.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/Hamster-Nest/' : '/',
  plugins: [react()],
}))
