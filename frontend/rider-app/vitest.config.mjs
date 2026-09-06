import { defineConfig } from 'vitest/config';

// The outbox core is deliberately free of React Native and Expo imports, so it runs
// headless here — a timeout is a function that never resolves, not something to
// reproduce by hand in a simulator.
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
