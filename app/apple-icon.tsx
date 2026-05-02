import { ImageResponse } from 'next/og'

// Apple touch icon. Next.js App Router convention generates the
// 180x180 PNG at build time and serves it at /apple-icon. iOS uses
// this when a user adds the site to their home screen, and as a
// favicon fallback in some browsers.
//
// Same letterform and palette as app/icon.tsx — brand red on white
// (#EF1F2D matches the novo-coral Tailwind token, same red as the
// Recognize CTA). Sized up so the letter has breathing room. iOS
// rounds the corners on its end so we leave the image square.

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          fontSize: 140,
          fontWeight: 800,
          letterSpacing: '-0.05em',
          paddingTop: 6,
        }}
      >
        n
      </div>
    ),
    { ...size }
  )
}
