import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@agent-tests',
        replacement: path.resolve(__dirname, './tests'),
      },
      {
        find: /^@agent-tests\/(.*)$/,
        replacement: path.resolve(__dirname, './tests/$1'),
      },
      {
        find: '@genfeedai/agent',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@genfeedai\/agent\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
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
        find: '@genfeedai/contexts',
        replacement: path.resolve(__dirname, '../contexts'),
      },
      {
        find: /^@genfeedai\/contexts\/(.*)$/,
        replacement: path.resolve(__dirname, '../contexts/$1'),
      },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(__dirname, '../constants/src/index.ts'),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(__dirname, '../constants/src/$1'),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(__dirname, '../enums/dist/index'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(__dirname, '../enums/dist/$1'),
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
        find: '@genfeedai/pages',
        replacement: path.resolve(__dirname, '../pages'),
      },
      {
        find: /^@genfeedai\/pages\/(.*)$/,
        replacement: path.resolve(__dirname, '../pages/$1'),
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
        find: /^@genfeedai\/services\/(.*)$/,
        replacement: path.resolve(__dirname, '../services/$1'),
      },
      {
        find: '@genfeedai/serializers',
        replacement: path.resolve(__dirname, '../serializers/src'),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(__dirname, '../serializers/src/$1'),
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
        find: '@components',
        replacement: path.resolve(__dirname, '../ui/src/components'),
      },
      {
        find: '@contexts',
        replacement: path.resolve(__dirname, '../contexts'),
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
        replacement: path.resolve(__dirname, '../providers'),
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
        find: '@services',
        replacement: path.resolve(__dirname, '../services'),
      },
      {
        find: '@utils',
        replacement: path.resolve(__dirname, '../utils'),
      },
      {
        find: '@ui-constants',
        replacement: path.resolve(__dirname, '../ui/src/components/constants'),
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
        find: '@ui/agent-panel',
        replacement: path.resolve(
          __dirname,
          '../ui/src/components/agent-panel',
        ),
      },
      {
        find: '@ui/dropdowns',
        replacement: path.resolve(__dirname, '../ui/src/components/dropdowns'),
      },
      {
        find: '@ui/menus',
        replacement: path.resolve(__dirname, '../ui/src/components/menus'),
      },
      {
        find: '@ui',
        replacement: path.resolve(__dirname, '../ui/src/components'),
      },
    ],
  },
  root: __dirname,
  test: {
    env: {
      NODE_ENV: 'test',
    },
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
    exclude: ['**/node_modules/**', '**/.git/**', '**/.agents/**'],
    globals: true,
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
  },
});
