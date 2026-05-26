/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0f17',
        panel: 'rgba(17, 24, 39, 0.85)',
        accent: '#10b981',
        accent2: '#3b82f6',
        warn: '#f59e0b',
        danger: '#ef4444'
      }
    }
  },
  plugins: []
}
