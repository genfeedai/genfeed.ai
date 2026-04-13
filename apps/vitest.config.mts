import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import {
  createVitestWarningLogger,
  installVitestWarningFilter,
} from '../configs/vitest-warning-filter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, './app');
const repoRoot = path.resolve(__dirname, '..');
installVitestWarningFilter();
const customLogger = createVitestWarningLogger();

export default defineConfig({
  customLogger,
  root: appRoot,
  resolve: {
    alias: [
      {
        find: /^@app$/,
        replacement: path.resolve(appRoot, './app'),
      },
      {
        find: /^@app\/(.*)$/,
        replacement: path.resolve(appRoot, './app/$1'),
      },
      {
        find: /^@app-config$/,
        replacement: path.resolve(appRoot, './packages/config'),
      },
      {
        find: /^@app-config\/(.*)$/,
        replacement: path.resolve(appRoot, './packages/config/$1'),
      },
      {
        find: /^@app-components$/,
        replacement: path.resolve(appRoot, './packages/components'),
      },
      {
        find: /^@app-components\/(.*)$/,
        replacement: path.resolve(appRoot, './packages/components/$1'),
      },
      {
        find: /^@app-server$/,
        replacement: path.resolve(appRoot, './packages/server'),
      },
      {
        find: /^@app-server\/(.*)$/,
        replacement: path.resolve(appRoot, './packages/server/$1'),
      },
      {
        find: /^@genfeedai\/config$/,
        replacement: path.resolve(repoRoot, './packages/config/src/index.ts'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/config/src/$1'),
      },
      {
        find: /^@genfeedai\/contexts$/,
        replacement: path.resolve(repoRoot, './packages/contexts/index.ts'),
      },
      {
        find: /^@genfeedai\/contexts\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/contexts/$1'),
      },
      {
        find: /^@genfeedai\/fonts$/,
        replacement: path.resolve(repoRoot, './packages/fonts/index.ts'),
      },
      {
        find: /^@genfeedai\/fonts\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/fonts/$1'),
      },
      {
        find: /^@genfeedai\/helpers$/,
        replacement: path.resolve(repoRoot, './packages/helpers/src/index.ts'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/helpers/src/$1'),
      },
      {
        find: /^@genfeedai\/interfaces$/,
        replacement: path.resolve(
          repoRoot,
          './packages/interfaces/src/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/interfaces/src/$1'),
      },
      {
        find: /^@genfeedai\/models$/,
        replacement: path.resolve(repoRoot, './packages/models/index.ts'),
      },
      {
        find: /^@genfeedai\/models\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/models/$1'),
      },
      {
        find: /^@genfeedai\/pages$/,
        replacement: path.resolve(repoRoot, './packages/pages/index.ts'),
      },
      {
        find: /^@genfeedai\/pages\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/pages/$1'),
      },
      {
        find: /^@genfeedai\/props$/,
        replacement: path.resolve(repoRoot, './packages/props/index.ts'),
      },
      {
        find: /^@genfeedai\/props\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/props/$1'),
      },
      {
        find: /^@genfeedai\/services$/,
        replacement: path.resolve(repoRoot, './packages/services/index.ts'),
      },
      {
        find: /^@genfeedai\/services\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/services/$1'),
      },
      {
        find: /^@genfeedai\/types$/,
        replacement: path.resolve(repoRoot, './packages/types/src/index.ts'),
      },
      {
        find: /^@genfeedai\/types\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/types/src/$1'),
      },
      {
        find: /^@genfeedai\/utils$/,
        replacement: path.resolve(repoRoot, './packages/utils/index.ts'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/utils/$1'),
      },
      {
        find: /^@contexts$/,
        replacement: path.resolve(repoRoot, './packages/contexts'),
      },
      {
        find: /^@contexts\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/contexts/$1'),
      },
      {
        find: /^@helpers$/,
        replacement: path.resolve(repoRoot, './packages/helpers/src'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/helpers/src/$1'),
      },
      {
        find: /^@hooks$/,
        replacement: path.resolve(repoRoot, './packages/hooks'),
      },
      {
        find: /^@hooks\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/hooks/$1'),
      },
      {
        find: /^@models$/,
        replacement: path.resolve(repoRoot, './packages/models'),
      },
      {
        find: /^@models\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/models/$1'),
      },
      {
        find: /^@pages$/,
        replacement: path.resolve(repoRoot, './packages/pages'),
      },
      {
        find: /^@pages\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/pages/$1'),
      },
      {
        find: /^@props$/,
        replacement: path.resolve(repoRoot, './packages/props'),
      },
      {
        find: /^@props\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/props/$1'),
      },
      {
        find: /^@providers$/,
        replacement: path.resolve(repoRoot, './packages/contexts/providers'),
      },
      {
        find: /^@providers\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/contexts/providers/$1'),
      },
      {
        find: /^@schemas$/,
        replacement: path.resolve(repoRoot, './packages/schemas'),
      },
      {
        find: /^@schemas\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/schemas/$1'),
      },
      {
        find: /^@services$/,
        replacement: path.resolve(repoRoot, './packages/services'),
      },
      {
        find: /^@services\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/services/$1'),
      },
      {
        find: /^@shared$/,
        replacement: path.resolve(repoRoot, './tests'),
      },
      {
        find: /^@shared\/(.*)$/,
        replacement: path.resolve(repoRoot, './tests/$1'),
      },
      {
        find: /^@styles$/,
        replacement: path.resolve(repoRoot, './packages/styles'),
      },
      {
        find: /^@styles\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/styles/$1'),
      },
      {
        find: /^@ui$/,
        replacement: path.resolve(repoRoot, './packages/ui/src/index.ts'),
      },
      {
        find: /^@ui\/primitives\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/ui/src/primitives/$1'),
      },
      {
        find: /^@ui\/core\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/ui/src/core/$1'),
      },
      {
        find: /^@ui\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/ui/src/components/$1'),
      },
      {
        find: /^@ui-constants$/,
        replacement: path.resolve(
          repoRoot,
          './packages/ui/src/components/constants',
        ),
      },
      {
        find: /^@ui-constants\/(.*)$/,
        replacement: path.resolve(
          repoRoot,
          './packages/ui/src/components/constants/$1',
        ),
      },
      {
        find: /^@utils$/,
        replacement: path.resolve(repoRoot, './packages/utils'),
      },
      {
        find: /^@utils\/(.*)$/,
        replacement: path.resolve(repoRoot, './packages/utils/$1'),
      },
      {
        find: 'server-only',
        replacement: path.resolve(__dirname, './app/tests/server-only.stub.ts'),
      },
      {
        find: /^@\/(.*)$/,
        replacement: path.resolve(appRoot, './src/$1'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**'],
    globals: true,
    include: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    setupFiles: [path.resolve(__dirname, './app/tests/setup.ts')],
    testTimeout: 15_000,
  },
});
