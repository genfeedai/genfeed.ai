import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const contractsSource = fileURLToPath(
  new URL('../../packages/contracts/src', import.meta.url),
);

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: [
      {
        find: /^@genfeedai\/contracts$/,
        replacement: `${contractsSource}/index.ts`,
      },
      {
        find: /^@genfeedai\/contracts\/(.*)$/,
        replacement: `${contractsSource}/$1`,
      },
    ],
  },
  test: {
    environment: 'node',
    // Nested suites (media/, outliers/) are discovered without editing this file.
    include: ['**/*.test.ts'],
    name: 'scripts/content-eval',
  },
});
