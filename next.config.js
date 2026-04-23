/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  async redirects() {
    return [
      // Legacy /committee/* URLs — folder was renamed to /leadership/* in
      // the tester-walkthrough rename pass. Keep permanent redirects so
      // bookmarks and in-flight Slack approver deep links still resolve.
      { source: '/committee', destination: '/leadership/dashboard', permanent: true },
      { source: '/committee/:path*', destination: '/leadership/:path*', permanent: true },

      // Legacy /approvals/queue URL — renamed to /review. Keep the
      // redirect so Slack "review and decide" deep links from older
      // messages still work (they carry ?nomination_id=...).
      { source: '/approvals/queue', destination: '/review', permanent: true },
    ]
  },
}

module.exports = nextConfig
