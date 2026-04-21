import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './modules/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'novo-ink': '#0A0A0A',
        'novo-paper': '#FFFFFF',
        'novo-oxblood': '#6F1721',
        'novo-coral': '#EF1F2D',
        'novo-pink-tint': '#FBE6EC',
        'novo-hot-pink': '#D4356D',
      },
      fontFamily: {
        display: ['var(--font-archivo-black)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
