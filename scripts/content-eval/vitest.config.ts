import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoPath = (path: string) =>
  fileURLToPath(new URL(`../../${path}`, import.meta.url));
const contractsSource = repoPath('packages/contracts/src');
const helpersSource = repoPath('packages/helpers/src');

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
      {
        find: /^@genfeedai\/helpers$/,
        replacement: `${helpersSource}/index.ts`,
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: `${helpersSource}/$1`,
      },
      // Pure API modules (generation-brief resolvers, readiness) for media/.
      {
        find: /^@api\/(.*)$/,
        replacement: `${repoPath('apps/server/api/src')}/$1`,
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
