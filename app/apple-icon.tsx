import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Apple touch icon. Next.js App Router convention generates the
// 180x180 PNG at build time and serves it at /apple-icon. iOS uses
// this when a user adds the site to their home screen, and as a
// favicon fallback in some browsers.
//
// Same letterform and palette as app/icon.tsx — Archivo Black "n"
// in brand red (#EF1F2D / novo-coral) on white. Sized up so the
// letter has breathing room. Font binary lives at
// app/_fonts/ArchivoBlack-Regular.ttf (OFL-licensed; same source as
// the favicon route). iOS rounds the corners on its end so we leave
// the image square.

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default async function AppleIcon() {
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
          fontSize: 160,
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
