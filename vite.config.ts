import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Netlify serves the app from the domain root; GitHub Pages no longer uses /Hamster-Nest/.
export default defineConfig({
  base: '/',
  plugins: [react()],
})
