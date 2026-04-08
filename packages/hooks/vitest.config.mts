import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import {
  createVitestWarningLogger,
  installVitestWarningFilter,
} from '../../configs/vitest-warning-filter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
installVitestWarningFilter();
const customLogger = createVitestWarningLogger();

const SERIALIZERS_SRC = path.resolve(__dirname, '../serializers/src');
const HELPERS_SRC = path.resolve(__dirname, '../helpers/src');
const CLIENT_SERIALIZERS_MOCK = path.resolve(
  __dirname,
  '../services/__mocks__/client-serializers.mock.ts',
);
const CLIENT_MODELS_MOCK = path.resolve(
  __dirname,
  './tests/__mocks__/client-models.mock.ts',
);

export default defineConfig({
  customLogger,
  resolve: {
    alias: [
      {
        find: /^@genfeedai\/client\/serializers$/,
        replacement: CLIENT_SERIALIZERS_MOCK,
      },
      {
        find: /^@genfeedai\/client\/models$/,
        replacement: CLIENT_MODELS_MOCK,
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.join(SERIALIZERS_SRC, '$1'),
      },
      { find: '@components', replacement: path.resolve(__dirname, '../ui') },
      {
        find: '@ui-constants',
        replacement: path.resolve(__dirname, '../ui/constants'),
      },
      {
        find: '@contexts',
        replacement: path.resolve(__dirname, '../contexts'),
      },
      { find: '@helpers', replacement: HELPERS_SRC },
      { find: /^@helpers\/(.*)$/, replacement: path.join(HELPERS_SRC, '$1') },
      { find: '@hooks', replacement: path.resolve(__dirname, '.') },
      { find: '@models', replacement: path.resolve(__dirname, '../models') },
      { find: '@props', replacement: path.resolve(__dirname, '../props') },
      {
        find: '@providers',
        replacement: path.resolve(__dirname, '../providers'),
      },
      {
        find: '@services/core/logger.service',
        replacement: path.resolve(
          __dirname,
          './tests/__mocks__/logger.service.ts',
        ),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../services'),
      },
      { find: '@ui', replacement: path.resolve(__dirname, '../ui') },
      { find: '@utils', replacement: path.resolve(__dirname, '../utils') },
    ],
  },
  test: {
    coverage: {
      clean: true,
      exclude: ['node_modules/', 'tests/', '**/*.d.ts', '**/*.config.*'],
      include: ['**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 35,
        functions: 42,
        lines: 40,
        statements: 40,
      },
    },
    env: {
      NODE_ENV: 'test',
    },
    environment: 'jsdom',
    exclude: ['**/node_modules/**'],
    globals: true,
    hookTimeout: 15_000,
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
  },
});
