import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import {
  createVitestWarningLogger,
  installVitestWarningFilter,
} from '../configs/vitest-warning-filter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, './app');
installVitestWarningFilter();
const customLogger = createVitestWarningLogger();

export default defineConfig({
  customLogger,
  root: appRoot,
  resolve: {
    alias: [
      {
        find: '@app',
        replacement: path.resolve(appRoot, './app'),
      },
      {
        find: '@app-components',
        replacement: path.resolve(appRoot, './packages/components'),
      },
      {
        find: '@app-server',
        replacement: path.resolve(appRoot, './packages/server'),
      },
      {
        find: '@contexts',
        replacement: path.resolve(__dirname, '../packages/contexts'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, '../packages/helpers/src'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../packages/helpers/src/$1'),
      },
      {
        find: '@hooks',
        replacement: path.resolve(__dirname, '../packages/hooks'),
      },
      {
        find: '@props',
        replacement: path.resolve(__dirname, '../packages/props'),
      },
      {
        find: '@providers',
        replacement: path.resolve(__dirname, '../packages/providers'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../packages/services'),
      },
      {
        find: '@ui',
        replacement: path.resolve(__dirname, '../packages/ui'),
      },
      {
        find: '@ui-constants',
        replacement: path.resolve(__dirname, '../packages/ui/constants'),
      },
      {
        find: '@utils',
        replacement: path.resolve(__dirname, '../packages/utils'),
      },
      {
        find: 'server-only',
        replacement: path.resolve(__dirname, './app/tests/server-only.stub.ts'),
      },
      {
        find: '@/',
        replacement: `${appRoot}/`,
      },
    ],
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**'],
    globals: true,
    include: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    testTimeout: 15_000,
  },
});
