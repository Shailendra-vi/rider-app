import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    fileParallelism: false,
    testTimeout: 20_000,
    setupFiles: ['./tests/setup.js'],
  },
});
