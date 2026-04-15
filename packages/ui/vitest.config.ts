import path from 'node:path';
import { defineConfig } from 'vitest/config';

const UI_SRC = path.resolve(__dirname, './src');
const UI_COMPONENTS_SRC = path.resolve(UI_SRC, './components');
const UI_PRIMITIVES_SRC = path.resolve(UI_SRC, './primitives');
const UI_CORE_SRC = path.resolve(UI_SRC, './core');
const UI_GENERATORS_SRC = path.resolve(UI_SRC, './generators');
const UI_SEMANTIC_SRC = path.resolve(UI_SRC, './semantic');
const UI_TASK_COMPOSER_SRC = path.resolve(UI_SRC, './task-composer');
const XYFLOW_REACT_MOCK = path.resolve(
  __dirname,
  './tests/__mocks__/xyflow-react.tsx',
);
const EMPTY_STYLE_MOCK = path.resolve(__dirname, './tests/__mocks__/style.ts');
const CONSTANTS_SRC = path.resolve(__dirname, '../constants/src');
const ENUMS_SRC = path.resolve(__dirname, '../enums/src');
const SERIALIZERS_SRC = path.resolve(__dirname, '../serializers/src');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/client',
        replacement: path.resolve(__dirname, '../client/src'),
      },
      {
        find: /^@genfeedai\/client\/(.*)$/,
        replacement: path.resolve(__dirname, '../client/src/$1'),
      },
      {
        find: '@genfeedai/constants',
        replacement: CONSTANTS_SRC,
      },
      {
        find: '@genfeedai/enums',
        replacement: ENUMS_SRC,
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
        find: '@genfeedai/serializers',
        replacement: SERIALIZERS_SRC,
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(SERIALIZERS_SRC, '$1'),
      },
      {
        find: '@ui/primitives',
        replacement: UI_PRIMITIVES_SRC,
      },
      {
        find: '@ui/core',
        replacement: UI_CORE_SRC,
      },
      {
        find: '@ui/generators',
        replacement: UI_GENERATORS_SRC,
      },
      {
        find: '@ui/semantic',
        replacement: UI_SEMANTIC_SRC,
      },
      {
        find: '@ui/task-composer',
        replacement: UI_TASK_COMPOSER_SRC,
      },
      {
        find: '@ui/styles',
        replacement: path.resolve(UI_COMPONENTS_SRC, './styles'),
      },
      {
        find: '@ui/tests',
        replacement: path.resolve(UI_COMPONENTS_SRC, './tests'),
      },
      {
        find: '@ui',
        replacement: UI_COMPONENTS_SRC,
      },
      {
        find: '@xyflow/react/dist/style.css',
        replacement: EMPTY_STYLE_MOCK,
      },
      {
        find: '@xyflow/react',
        replacement: XYFLOW_REACT_MOCK,
      },
      {
        find: '@contexts',
        replacement: path.resolve(__dirname, '../contexts'),
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
        replacement: path.resolve(__dirname, '../contexts/providers'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../services'),
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
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
