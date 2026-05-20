import { defineConfig } from 'vitest/config';

const isSmokeRun = process.argv.some((arg) => arg.includes('browser.smoke.test.ts'));

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'research',
      ...(isSmokeRun ? [] : ['tests/browser.smoke.test.ts']),
    ],
  },
});
