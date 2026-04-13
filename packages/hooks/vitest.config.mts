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
const ENUMS_SRC = path.resolve(__dirname, '../enums/src');
const CONSTANTS_SRC = path.resolve(__dirname, '../constants/src');
const INTERFACES_SRC = path.resolve(__dirname, '../interfaces/src');
const CLIENT_SERIALIZERS_MOCK = path.resolve(
  __dirname,
  '../services/__mocks__/client-serializers.mock.ts',
);
const CLIENT_MODELS_MOCK = path.resolve(
  __dirname,
  './tests/__mocks__/client-models.mock.ts',
);
const XYFLOW_REACT_MOCK = path.resolve(
  __dirname,
  './tests/__mocks__/xyflow-react.ts',
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
      {
        find: /^@genfeedai\/constants$/,
        replacement: path.join(CONSTANTS_SRC, 'index.ts'),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.join(CONSTANTS_SRC, '$1'),
      },
      {
        find: /^@genfeedai\/enums$/,
        replacement: path.join(ENUMS_SRC, 'index.ts'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.join(ENUMS_SRC, '$1'),
      },
      {
        find: /^@genfeedai\/helpers$/,
        replacement: path.join(HELPERS_SRC, 'index.ts'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.join(HELPERS_SRC, '$1'),
      },
      {
        find: /^@genfeedai\/interfaces$/,
        replacement: path.join(INTERFACES_SRC, 'index.ts'),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.join(INTERFACES_SRC, '$1'),
      },
      {
        find: '@xyflow/react',
        replacement: XYFLOW_REACT_MOCK,
      },
      {
        find: '@components',
        replacement: path.resolve(__dirname, '../ui/src/components'),
      },
      {
        find: '@genfeedai/contexts',
        replacement: path.resolve(__dirname, '../contexts'),
      },
      {
        find: /^@genfeedai\/contexts\/(.*)$/,
        replacement: path.resolve(__dirname, '../contexts/$1'),
      },
      {
        find: '@genfeedai/models',
        replacement: path.resolve(__dirname, '../models'),
      },
      {
        find: /^@genfeedai\/models\/(.*)$/,
        replacement: path.resolve(__dirname, '../models/$1'),
      },
      {
        find: '@genfeedai/props',
        replacement: path.resolve(__dirname, '../props'),
      },
      {
        find: /^@genfeedai\/props\/(.*)$/,
        replacement: path.resolve(__dirname, '../props/$1'),
      },
      {
        find: '@genfeedai/providers',
        replacement: path.resolve(__dirname, '../contexts/providers'),
      },
      {
        find: /^@genfeedai\/providers\/(.*)$/,
        replacement: path.resolve(__dirname, '../contexts/providers/$1'),
      },
      {
        find: '@genfeedai/services',
        replacement: path.resolve(__dirname, '../services'),
      },
      {
        find: /^@genfeedai\/services\/(.*)$/,
        replacement: path.resolve(__dirname, '../services/$1'),
      },
      {
        find: '@genfeedai/utils',
        replacement: path.resolve(__dirname, '../utils'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(__dirname, '../utils/$1'),
      },
      {
        find: '@ui-constants',
        replacement: path.resolve(__dirname, '../ui/src/components/constants'),
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
        replacement: path.resolve(__dirname, '../contexts/providers'),
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
      {
        find: '@ui/primitives',
        replacement: path.resolve(__dirname, '../ui/src/primitives'),
      },
      {
        find: '@ui/styles',
        replacement: path.resolve(__dirname, '../ui/src/components/styles'),
      },
      {
        find: '@ui',
        replacement: path.resolve(__dirname, '../ui/src/components'),
      },
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
