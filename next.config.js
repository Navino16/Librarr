/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'covers.openlibrary.org' },
      { protocol: 'https', hostname: 'books.google.com' },
      { protocol: 'https', hostname: 'coverartarchive.org' },
      { protocol: 'https', hostname: 'archive.org' },
      { protocol: 'https', hostname: '**.us.archive.org' },
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: '**.media-amazon.com' },
      { protocol: 'https', hostname: 'i.gr-assets.com' },
      { protocol: 'https', hostname: 'assets.hardcover.app' },
    ],
  },
  async rewrites() {
    // In production Express serves both API and Next.js — no rewrite needed
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:5055/api/v1/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
