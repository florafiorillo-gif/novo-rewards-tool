import { ImageResponse } from 'next/og'

// Browser favicon. Next.js App Router convention generates the
// 32x32 PNG at build time and serves it at /icon. A simple bold
// "n" letterform on the brand's off-white surface, in ink black —
// matches the Novo wordmark at the smallest scale that still
// reads. No detail beyond the letter survives at 16x16 anyway.
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
          background: '#FAFAF7',
          color: '#0A0A0A',
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
