const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg'],
  turbopack: {
    root: path.join(__dirname),
  },
}

module.exports = nextConfig
