import type { Metadata } from 'next'
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
      <body className={inter.className}>{children}</body>
    </html>
  )
}
