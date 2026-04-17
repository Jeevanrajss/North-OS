/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f7f8',
          100: '#ececed',
          200: '#d6d6d8',
          400: '#9a9aa0',
          600: '#6a6a72',
          800: '#2a2a2e',
          900: '#1a1a1d',
          950: '#0f0f10',
        },
        accent: {
          DEFAULT: '#6b7ce6',
          muted: '#3b4384',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
