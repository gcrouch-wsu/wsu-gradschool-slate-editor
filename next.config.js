/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg'],
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    if (process.env.VERCEL_ENV !== 'production' || !process.env.VERCEL_URL || !process.env.PUBLIC_ORIGIN) return []
    const canonical = new URL(process.env.PUBLIC_ORIGIN)
    if (canonical.host === process.env.VERCEL_URL) return []
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: process.env.VERCEL_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }],
        destination: `${canonical.origin}/:path*`,
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
