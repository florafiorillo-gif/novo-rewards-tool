import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Browser favicon. Next.js App Router convention generates the
// 32x32 PNG at build time and serves it at /icon. A bold lowercase
// "n" in brand red on white that mirrors the wordmark in AppHeader
// (font-display = Archivo Black, color novo-ink there; here we
// recolor to novo-coral so the icon stands out in the browser tab).
//
// Why ship the font in-repo: ImageResponse / Satori needs the binary
// at render time and only accepts TTF/OTF/WOFF (not the .woff2 that
// next/font caches). The TTF lives at app/_fonts/ArchivoBlack-Regular.ttf
// (OFL-licensed; sourced from the official Google Fonts repo). Read once
// per render — the icon route is built statically so this fires at build,
// not on every request.
//
// Color (#EF1F2D) matches the novo-coral Tailwind token, same red as
// the Recognize CTA. Hex is hard-coded because the Tailwind theme
// isn't in scope inside ImageResponse; keep this in sync if the
// brand red token ever changes.
//
// Apple touch icon lives in app/apple-icon.tsx (separate file so each
// size can be tuned independently).

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default async function Icon() {
  const fontData = await readFile(
    join(process.cwd(), 'app/_fonts/ArchivoBlack-Regular.ttf')
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#FFFFFF',
          color: '#EF1F2D',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Archivo Black',
          // Archivo Black only ships at weight 400 — the heaviness is
          // built into the font, not a separate weight. Sizing tuned to
          // fill the canvas: at 32px the "n" sits comfortably inside
          // the safe area without clipping descenders.
          fontSize: 30,
          letterSpacing: '-0.025em',
        }}
      >
        n
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Archivo Black',
          data: fontData,
          weight: 400,
          style: 'normal',
        },
      ],
    }
  )
}
