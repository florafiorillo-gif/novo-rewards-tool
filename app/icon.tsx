import { ImageResponse } from 'next/og'

// Browser favicon. Next.js App Router convention generates the
// 32x32 PNG at build time and serves it at /icon. A bold "n"
// letterform in brand red on white — reads as Novo at favicon
// scale where the previous ink-on-off-white treatment looked like
// the default Next.js placeholder.
//
// Color matches tailwind.config.ts → colors['novo-coral'] (#EF1F2D),
// the same red used by the persistent Recognize CTA in AppHeader.
// Hex is hard-coded here because the Tailwind theme isn't in scope
// inside Next's ImageResponse renderer; keep this in sync if the
// brand red token ever changes.
//
// Apple touch icon lives in app/apple-icon.tsx (separate file
// so each size can be tuned independently).

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
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
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: '-0.05em',
          paddingTop: 1,
        }}
      >
        n
      </div>
    ),
    { ...size }
  )
}
