import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
const UI_SRC = path.resolve(__dirname, './src');
const UI_COMPONENTS_SRC = path.resolve(UI_SRC, './components');
const UI_PRIMITIVES_SRC = path.resolve(UI_SRC, './primitives');
const UI_CORE_SRC = path.resolve(UI_SRC, './core');
const UI_GENERATORS_SRC = path.resolve(UI_SRC, './generators');
const UI_MODALS_SRC = path.resolve(UI_SRC, './modals');
const UI_SEMANTIC_SRC = path.resolve(UI_SRC, './semantic');
const UI_TASK_COMPOSER_SRC = path.resolve(UI_SRC, './task-composer');
const SERWIST_NEXT_WORKER_MOCK = path.resolve(
  __dirname,
  './tests/__mocks__/serwist-next-worker.ts',
);
const SERWIST_MOCK = path.resolve(__dirname, './tests/__mocks__/serwist.ts');
const XYFLOW_REACT_MOCK = path.resolve(
  __dirname,
  './tests/__mocks__/xyflow-react.tsx',
);
const EMPTY_STYLE_MOCK = path.resolve(__dirname, './tests/__mocks__/style.ts');
const SERIALIZERS_SRC = path.resolve(__dirname, '../serializers/src');
const AGENT_SRC = path.resolve(__dirname, '../agent/src');
const PAGES_SRC = path.resolve(__dirname, '../pages');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/client',
        replacement: path.resolve(__dirname, '../client/src'),
      },
      {
        find: /^@genfeedai\/agent$/,
        replacement: path.resolve(AGENT_SRC, 'index.ts'),
      },
      {
        find: '@genfeedai/agent/components',
        replacement: path.resolve(AGENT_SRC, 'components'),
      },
      {
        find: '@genfeedai/agent/components/AgentChatContainer',
        replacement: path.resolve(
          AGENT_SRC,
          'components/AgentChatContainer.tsx',
        ),
      },
      {
        find: '@genfeedai/agent/components/AgentOutputsPanel',
        replacement: path.resolve(
          AGENT_SRC,
          'components/AgentOutputsPanel.tsx',
        ),
      },
      {
        find: '@genfeedai/agent/components/AgentPanel',
        replacement: path.resolve(AGENT_SRC, 'components/AgentPanel.tsx'),
      },
      {
        find: '@genfeedai/agent/services',
        replacement: path.resolve(AGENT_SRC, 'services'),
      },
      {
        find: '@genfeedai/agent/services/agent-api.service',
        replacement: path.resolve(AGENT_SRC, 'services/agent-api.service.ts'),
      },
      {
        find: '@genfeedai/agent/services/agent-base-api.service',
        replacement: path.resolve(
          AGENT_SRC,
          'services/agent-base-api.service.ts',
        ),
      },
      {
        find: '@genfeedai/agent/stores',
        replacement: path.resolve(AGENT_SRC, 'stores'),
      },
      {
        find: '@genfeedai/agent/stores/agent-chat.store',
        replacement: path.resolve(AGENT_SRC, 'stores/agent-chat.store.ts'),
      },
      {
        find: /^@genfeedai\/agent\/(.*)$/,
        replacement: `${AGENT_SRC}/$1`,
      },
      {
        find: /^@genfeedai\/client\/(.*)$/,
        replacement: path.resolve(__dirname, '../client/src/$1'),
      },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(__dirname, '../constants/src/index.ts'),
      },
      {
        find: '@genfeedai/constants/model-brands.constant',
        replacement: path.resolve(
          __dirname,
          '../constants/src/model-brands.constant.ts',
        ),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(__dirname, '../constants/src/$1'),
      },
      {
        find: '@genfeedai/enums',
        replacement: require.resolve('@genfeedai/enums'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(__dirname, '../enums/src/$1'),
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
        find: /^@genfeedai\/serializers\/(.*)$/,
        replacement: path.resolve(SERIALIZERS_SRC, '$1'),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(SERIALIZERS_SRC, '$1'),
      },
      {
        find: /^@ui\/primitives\/(.*)$/,
        replacement: path.resolve(UI_PRIMITIVES_SRC, '$1'),
      },
      {
        find: '@ui/primitives',
        replacement: UI_PRIMITIVES_SRC,
      },
      {
        find: /^@ui\/core\/(.*)$/,
        replacement: path.resolve(UI_CORE_SRC, '$1'),
      },
      {
        find: '@ui/core',
        replacement: UI_CORE_SRC,
      },
      {
        find: /^@ui\/generators\/(.*)$/,
        replacement: path.resolve(UI_GENERATORS_SRC, '$1'),
      },
      {
        find: /^@ui\/modals\/compound\/(.*)$/,
        replacement: path.resolve(UI_MODALS_SRC, './compound/$1'),
      },
      {
        find: '@ui/modals/compound',
        replacement: path.resolve(UI_MODALS_SRC, './compound'),
      },
      {
        find: '@ui/generators',
        replacement: UI_GENERATORS_SRC,
      },
      {
        find: /^@ui\/semantic\/(.*)$/,
        replacement: path.resolve(UI_SEMANTIC_SRC, '$1'),
      },
      {
        find: '@ui/semantic',
        replacement: UI_SEMANTIC_SRC,
      },
      {
        find: /^@ui\/task-composer\/(.*)$/,
        replacement: path.resolve(UI_TASK_COMPOSER_SRC, '$1'),
      },
      {
        find: '@ui/task-composer',
        replacement: UI_TASK_COMPOSER_SRC,
      },
      {
        find: /^@ui\/styles\/(.*)$/,
        replacement: path.resolve(UI_COMPONENTS_SRC, './styles/$1'),
      },
      {
        find: '@ui/dropdowns/base/DropdownBase',
        replacement: path.resolve(
          UI_COMPONENTS_SRC,
          './dropdowns/base/DropdownBase.tsx',
        ),
      },
      {
        find: '@ui/styles',
        replacement: path.resolve(UI_COMPONENTS_SRC, './styles'),
      },
      {
        find: /^@ui\/tests\/(.*)$/,
        replacement: path.resolve(UI_COMPONENTS_SRC, './tests/$1'),
      },
      {
        find: '@ui/tests',
        replacement: path.resolve(UI_COMPONENTS_SRC, './tests'),
      },
      {
        find: /^@ui-constants\/(.*)$/,
        replacement: path.resolve(UI_COMPONENTS_SRC, './constants/$1'),
      },
      {
        find: '@ui-constants',
        replacement: path.resolve(UI_COMPONENTS_SRC, './constants'),
      },
      {
        find: /^@ui\/(.*)$/,
        replacement: path.resolve(UI_COMPONENTS_SRC, '$1'),
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
        find: '@serwist/next/worker',
        replacement: SERWIST_NEXT_WORKER_MOCK,
      },
      {
        find: 'serwist',
        replacement: SERWIST_MOCK,
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
        find: '@pages',
        replacement: PAGES_SRC,
      },
      {
        find: /^@pages\/(.*)$/,
        replacement: `${PAGES_SRC}/$1`,
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
