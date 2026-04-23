import type { Metadata } from 'next'
import { Inter, Archivo_Black } from 'next/font/google'
import { AppHeader } from '@/components/layout/AppHeader'
// Side-effect import: seeds the in-memory mock stores on first load when
// USE_MOCK_DATA=true + SEED_MODE=demo. Guarded by a globalThis flag so
// HMR can't double-seed. No-op when either flag is unset.
import '@/modules/seed/demo-bootstrap'
import '../styles/globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-archivo-black',
})

export const metadata: Metadata = {
  title: 'Novo Rewards',
  description: 'Novo Rewards and Recognition',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${archivoBlack.variable}`}>
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  )
}
