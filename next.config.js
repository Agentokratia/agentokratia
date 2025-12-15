/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
  },
  // Exclude problematic packages from server-side bundling
  serverExternalPackages: ['pino', 'thread-stream', 'pino-pretty', 'why-is-node-running', 'tap'],
  // Transpile packages that have ESM/CJS issues
  transpilePackages: ['@walletconnect/logger'],
};

module.exports = nextConfig;
