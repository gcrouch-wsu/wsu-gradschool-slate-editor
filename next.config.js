/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg'],
  turbopack: {
    root: __dirname,
  },
}

module.exports = nextConfig
