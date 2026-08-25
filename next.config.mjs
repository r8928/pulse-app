/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `eslint` key: Next 16 removed it. Linting is Biome's job, run separately
  // via `npm run lint`, which is also what the commit gate uses.

  // MUI ships ES modules per component; this keeps the barrel imports we write
  // from pulling the whole library into a route's bundle.
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
  },

  /**
   * The three routes the Attendance & Leaves merge retired.
   *
   * README.md already records that a routed, gated screen reachable only by
   * typing its URL is an invisible screen. The inverse costs as much: a link
   * somebody has already sent, or a browser bookmark, answering 404 the day
   * after a reshuffle. These keep both working.
   *
   * `permanent: false` deliberately — a 308 is cached by the browser forever,
   * and these paths may well be wanted again.
   */
  async redirects() {
    return [
      { source: '/reports', destination: '/attendance', permanent: false },
      {
        source: '/reports/annual',
        destination: '/attendance/annual',
        permanent: false,
      },
      {
        source: '/attendance/entry',
        destination: '/attendance/daily',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
