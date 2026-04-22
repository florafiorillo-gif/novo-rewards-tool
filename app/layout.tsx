import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter, Archivo_Black } from 'next/font/google'
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
      <body className={inter.className}>
        {/* Persistent nav. Clicking the wordmark takes you home from any
            page. If signed out, middleware bounces to /auth/signin. This is
            the only guarantee that no page becomes a dead end. */}
        <header className="border-b border-gray-200 bg-novo-paper">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
            <Link
              href="/dashboard"
              className="font-display text-sm uppercase tracking-tight text-novo-ink hover:opacity-80"
            >
              Novo Rewards
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  )
}
