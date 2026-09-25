/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Theme-aware: each shade is a CSS variable (RGB triplet) that
        // flips between dark and light — see --ink-* in globals.css.
        ink: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, `rgb(var(--ink-${n}) / <alpha-value>)`]),
        ),
        fg: { 1: 'var(--fg-1)', 2: 'var(--fg-2)', 3: 'var(--fg-3)', 4: 'var(--fg-4)' },
        accent: {
          DEFAULT: 'rgb(var(--primary-rgb) / <alpha-value>)',
          hover:   'rgb(var(--primary-rgb) / <alpha-value>)',
          muted:   '#4E3FB8',              // primary-800
          glow:    'rgba(139,124,255,0.15)',
        },
      },
      fontFamily: {
        sans:    ['Inter var', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Clash Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card:    '16px',
        'card-xl': '20px',
      },
      backgroundImage: {
        'gradient-primary':      'linear-gradient(135deg, #8B7CFF 0%, #6352DB 100%)',
        'gradient-primary-soft': 'linear-gradient(135deg, rgba(139,124,255,0.16), rgba(99,82,219,0.08))',
        'gradient-aurora':       'linear-gradient(135deg, #8B7CFF 0%, #3EBEFF 50%, #FF7AD9 100%)',
      },
    },
  },
  plugins: [],
};
