import path from 'node:path';
import { defineConfig } from 'vitest/config';

const UI_SRC = path.resolve(__dirname, './src');
const UI_COMPONENTS_SRC = path.resolve(UI_SRC, './components');
const UI_PRIMITIVES_SRC = path.resolve(UI_SRC, './primitives');
const UI_CORE_SRC = path.resolve(UI_SRC, './core');
const UI_CHARTS_SRC = path.resolve(UI_SRC, './charts.ts');
const UI_FLOWS_SRC = path.resolve(UI_SRC, './flows.ts');
const UI_GENERATORS_SRC = path.resolve(UI_SRC, './generators');
const UI_MODALS_SRC = path.resolve(UI_SRC, './modals');
const UI_SEMANTIC_SRC = path.resolve(UI_SRC, './semantic');
const UI_TOKENS_SRC = path.resolve(UI_SRC, './tokens');
const XYFLOW_REACT_MOCK = path.resolve(
  __dirname,
  './tests/__mocks__/xyflow-react.tsx',
);
const BETTER_AUTH_REACT_MOCK = path.resolve(
  __dirname,
  './tests/__mocks__/better-auth-react.ts',
);
const EMPTY_STYLE_MOCK = path.resolve(__dirname, './tests/__mocks__/style.ts');
const API_TYPES_SRC = path.resolve(__dirname, '../api-types/src');
const AUTH_CLIENT_SRC = path.resolve(__dirname, '../auth-client/src');
const CONSTANTS_SRC = path.resolve(__dirname, '../constants/src');
const CONFIG_SRC = path.resolve(__dirname, '../config/src');
const ENUMS_SRC = path.resolve(__dirname, '../enums/src');
const INTERFACES_SRC = path.resolve(__dirname, '../interfaces/src');
const PRICING_SRC = path.resolve(__dirname, '../pricing/src');
const SERIALIZERS_SRC = path.resolve(__dirname, '../serializers/src');
const AGENT_SRC = path.resolve(__dirname, '../agent/src');
const PAGES_SRC = path.resolve(__dirname, '../pages');

export default defineConfig({
  resolve: {
    alias: [
      {
        // Resolve Better Auth to a timer-free test implementation before
        // dependency externalization. Runtime vi.mock interception does not
        // cover package-local realpaths in every Bun dependency layout.
        find: /^better-auth\/react$/,
        replacement: BETTER_AUTH_REACT_MOCK,
      },
      {
        find: /^@genfeedai\/auth-client$/,
        replacement: path.resolve(AUTH_CLIENT_SRC, 'index.ts'),
      },
      {
        find: /^@genfeedai\/auth-client\/(.*)$/,
        replacement: path.resolve(AUTH_CLIENT_SRC, '$1'),
      },
      {
        find: /^@genfeedai\/interfaces$/,
        replacement: path.resolve(INTERFACES_SRC, 'index.ts'),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(INTERFACES_SRC, '$1'),
      },
      {
        find: /^@genfeedai\/config$/,
        replacement: path.resolve(CONFIG_SRC, 'index.ts'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(CONFIG_SRC, '$1'),
      },
      {
        find: /^@api-types\/(.*)$/,
        replacement: path.resolve(API_TYPES_SRC, '$1'),
      },
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
        replacement: CONSTANTS_SRC,
      },
      {
        find: '@genfeedai/constants/model-brands.constant',
        replacement: path.resolve(CONSTANTS_SRC, 'model-brands.constant.ts'),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(CONSTANTS_SRC, '$1'),
      },
      {
        find: '@genfeedai/enums',
        replacement: ENUMS_SRC,
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
        find: /^@genfeedai\/ui$/,
        replacement: path.resolve(UI_SRC, 'index.ts'),
      },
      {
        find: /^@genfeedai\/ui\/(.*)$/,
        replacement: path.resolve(UI_SRC, '$1'),
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
        find: '@genfeedai/pricing',
        replacement: path.resolve(PRICING_SRC, 'index.ts'),
      },
      {
        find: /^@genfeedai\/pricing\/(.*)$/,
        replacement: path.resolve(PRICING_SRC, '$1'),
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
        find: '@ui/charts',
        replacement: UI_CHARTS_SRC,
      },
      {
        find: /^@ui\/components\/(.*)$/,
        replacement: path.resolve(UI_COMPONENTS_SRC, '$1'),
      },
      {
        find: '@ui/flows',
        replacement: UI_FLOWS_SRC,
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
        find: /^@ui\/tokens\/(.*)$/,
        replacement: path.resolve(UI_TOKENS_SRC, '$1'),
      },
      {
        find: '@ui/tokens',
        replacement: UI_TOKENS_SRC,
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
        find: /src\/flows\/flows\.css$/,
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Weekly Coverage job (run 31367395806, 2026-08-10): 54.89% branches,
      // 50.08% functions, 58.57% lines, 58.17% statements. Floor is ~2 points
      // below that merged table so the suite can move a little without going
      // back to being unmeasured.
      thresholds: {
        branches: 52,
        functions: 48,
        lines: 56,
        statements: 56,
      },
    },
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    globals: true,
    // Full-suite runs saturate the workers with heavy module imports; the
    // vitest default of 5s flakes first renders under that load.
    hookTimeout: 30_000,
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    // Memory hygiene: one fork, no file parallelism, reclaim mocks. Isolate
    // stays on — sharing the module cache pollutes vi.mock across files.
    // The suite still OOMs a single process after ~2500 tests, so `package.json`
    // runs two sequential vitest shards so each process can exit.
    clearMocks: true,
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'forks',
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
