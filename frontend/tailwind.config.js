/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#07070e',
          1: '#0d0d18',
          2: '#12121f',
          3: '#181828',
          4: '#1e1e32',
        },
        border: '#252540',
        primary: '#6366f1',
        'primary-dim': '#4f46e5',
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        muted: '#64748b',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
