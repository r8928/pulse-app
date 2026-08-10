import path from 'node:path';
import { defineConfig } from 'vitest/config';

const alias = { '@': path.resolve(process.cwd()) };
const exclude = ['.claude/**', 'node_modules/**'];

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          include: ['**/__tests__/**/*.test.js'],
          exclude,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.js'],
          globals: true,
          include: ['**/__tests__/**/*.test.jsx'],
          exclude,
          // Component tests run ~2.5x slower under the suite's own worker
          // contention than in isolation (measured: 1.5s isolated -> 4.2s in a
          // full run). The 5s default left the slowest three at 80-98% of
          // budget, so ordinary jitter timed them out intermittently. Node
          // tests keep the 5s default so a genuine hang still fails fast.
          testTimeout: 15000,
        },
      },
    ],
  },
});
