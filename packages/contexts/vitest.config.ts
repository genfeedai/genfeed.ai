import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const SERIALIZERS_SRC = path.resolve(__dirname, '../serializers/src');
const CLIENT_MODELS_MOCK = path.resolve(
  __dirname,
  '../hooks/tests/__mocks__/client-models.mock.ts',
);
const CLIENT_SERIALIZERS_MOCK = path.resolve(
  __dirname,
  '../services/__mocks__/serializers.mock.ts',
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@genfeedai\/client\/models$/,
        replacement: CLIENT_MODELS_MOCK,
      },
      {
        find: /^@genfeedai\/client\/serializers$/,
        replacement: CLIENT_SERIALIZERS_MOCK,
      },
      {
        find: '@contexts',
        replacement: path.resolve(__dirname, '.'),
      },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(__dirname, '../constants/src'),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(__dirname, '../enums/src'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(__dirname, '../utils/$1'),
      },
      {
        find: '@genfeedai/utils',
        replacement: path.resolve(__dirname, '../utils'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(__dirname, '../helpers/src'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../helpers/src/$1'),
      },
      {
        find: '@genfeedai/hooks',
        replacement: path.resolve(__dirname, '../hooks'),
      },
      {
        find: /^@genfeedai\/hooks\/(.*)$/,
        replacement: path.resolve(__dirname, '../hooks/$1'),
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
        find: '@genfeedai/services',
        replacement: path.resolve(__dirname, '../services'),
      },
      {
        find: '@genfeedai/serializers',
        replacement: SERIALIZERS_SRC,
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(SERIALIZERS_SRC, '$1'),
      },
      {
        find: /^@genfeedai\/services\/(.*)$/,
        replacement: path.resolve(__dirname, '../services/$1'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, '../helpers/src'),
      },
      {
        find: '@hooks',
        replacement: path.resolve(__dirname, '../hooks'),
      },
      {
        find: '@models',
        replacement: path.resolve(__dirname, '../models'),
      },
      {
        find: '@props',
        replacement: path.resolve(__dirname, '../props'),
      },
      {
        find: '@providers',
        replacement: path.resolve(__dirname, './providers'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../services'),
      },
      {
        find: '@ui',
        replacement: path.resolve(__dirname, '../ui/src/components'),
      },
      {
        find: '@utils',
        replacement: path.resolve(__dirname, '../utils'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    globals: true,
    hookTimeout: 30_000,
    include: ['**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
  },
});
