/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `eslint` key: Next 16 removed it. Linting is Biome's job, run separately
  // via `npm run lint`, which is also what the commit gate uses.

  // MUI ships ES modules per component; this keeps the barrel imports we write
  // from pulling the whole library into a route's bundle.
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
  },
};

export default nextConfig;
