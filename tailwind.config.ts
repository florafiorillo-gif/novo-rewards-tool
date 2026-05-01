import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './modules/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── Color system ──────────────────────────────────────────────────────
      // Neutrals are warm (paper-stock ish) to pair with Novo's coral/oxblood.
      // Ink is the single primary-action colour; coral is reserved for
      // critical/warning states (deny, over-budget, blocked). Everything else
      // is neutral.
      colors: {
        'novo-ink': '#0A0A0A',
        'novo-paper': '#FFFFFF',
        'novo-surface': '#FAFAF7',
        'novo-elevated': '#FFFFFF',
        'novo-border': '#E8E5DE',
        'novo-border-strong': '#CFCAC0',
        'novo-subtle': '#6B675E',
        'novo-muted': '#9A958A',
        'novo-hover': '#F4F1EA',
        'novo-oxblood': '#6F1721',
        'novo-coral': '#EF1F2D',
        'novo-pink-tint': '#FBE6EC',
        'novo-hot-pink': '#D4356D',
        // Novo yellow-green pair. Used on Assume Best Intention +
        // Intellectual Honesty value pills, on the demo "sim" badge,
        // and anywhere a positive/affirmative brand accent is wanted.
        'novo-lime': '#C4DD3D',
        'novo-lime-soft': '#E5EBC8',
      },
      // ── Type scale ────────────────────────────────────────────────────────
      // Tight scale, Linear-ish. Paired with tight letter-spacing at the top
      // end so headlines feel confident without Archivo Black everywhere.
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        xs: ['12px', { lineHeight: '18px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['14px', { lineHeight: '22px' }],
        lg: ['15px', { lineHeight: '24px' }],
        xl: ['17px', { lineHeight: '26px', letterSpacing: '-0.005em' }],
        '2xl': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
        '3xl': ['26px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
        '4xl': ['34px', { lineHeight: '42px', letterSpacing: '-0.025em' }],
        '5xl': ['44px', { lineHeight: '52px', letterSpacing: '-0.03em' }],
      },
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        display: ['var(--font-archivo-black)', 'system-ui', 'sans-serif'],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      // ── Spacing extras ────────────────────────────────────────────────────
      // Tailwind's default scale is fine; these are just useful page widths.
      maxWidth: {
        content: '720px',
        app: '1120px',
        shell: '1280px',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
      },
      boxShadow: {
        card: '0 1px 0 rgba(10,10,10,0.02), 0 1px 2px rgba(10,10,10,0.04)',
        elevated:
          '0 1px 0 rgba(10,10,10,0.02), 0 2px 6px rgba(10,10,10,0.06), 0 8px 24px rgba(10,10,10,0.04)',
      },
    },
  },
  plugins: [],
}

export default config
