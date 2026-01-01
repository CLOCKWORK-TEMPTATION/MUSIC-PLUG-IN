/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@music-rec/shared'],
  reactStrictMode: true,
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
