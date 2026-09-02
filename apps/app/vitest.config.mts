import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../vitest.config.mts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isShardRun = process.argv.some(
  (arg) => arg === '--shard' || arg.startsWith('--shard='),
);
const isChangedCodeCoverageRun = process.env.CHANGED_CODE_COVERAGE === '1';

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^@components\/buttons\/refresh\/button-refresh\/ButtonRefresh$/,
          replacement: path.resolve(
            __dirname,
            '../../packages/ui/src/components/buttons/refresh/button-refresh/ButtonRefresh.tsx',
          ),
        },
        {
          find: /^@components\/cards\/KpiCard$/,
          replacement: path.resolve(
            __dirname,
            './packages/components/admin/cards/KpiCard.tsx',
          ),
        },
        {
          find: /^@components\/lazy\/lazy-modal.admin$/,
          replacement: path.resolve(
            __dirname,
            './packages/components/admin/lazy/lazy-modal.admin.ts',
          ),
        },
        {
          find: /^@components\/lazy\/modal\/LazyModal$/,
          replacement: path.resolve(
            __dirname,
            '../../packages/ui/src/components/lazy/modal/LazyModal.tsx',
          ),
        },
        {
          find: /^@components\/loading\/fallback\/LazyLoadingFallback$/,
          replacement: path.resolve(
            __dirname,
            '../../packages/ui/src/components/loading/fallback/LazyLoadingFallback.tsx',
          ),
        },
        {
          find: /^@components\/modals\/actions\/ModalActions$/,
          replacement: path.resolve(
            __dirname,
            '../../packages/ui/src/components/modals/actions/ModalActions.tsx',
          ),
        },
        {
          find: /^@components\/modals\/modal\/Modal$/,
          replacement: path.resolve(
            __dirname,
            '../../packages/ui/src/components/modals/modal/Modal.tsx',
          ),
        },
        {
          find: /^@components\/modals\/ModalRole$/,
          replacement: path.resolve(
            __dirname,
            './packages/components/admin/modals/ModalRole.tsx',
          ),
        },
        {
          find: /^@components\/modals\/ModalSubscription$/,
          replacement: path.resolve(
            __dirname,
            './packages/components/admin/modals/ModalSubscription.tsx',
          ),
        },
        {
          find: /^@components\/social\/SocialLinks$/,
          replacement: path.resolve(
            __dirname,
            './packages/components/admin/social/SocialLinks.tsx',
          ),
        },
        {
          // Resolve Better Auth to a timer-free test implementation before
          // dependency externalization. Runtime vi.mock interception no longer
          // covers the package-local realpath used by Better Auth 1.6.23.
          find: /^better-auth\/react$/,
          replacement: path.resolve(
            __dirname,
            './tests/better-auth-react.stub.ts',
          ),
        },
        {
          find: 'server-only',
          replacement: path.resolve(__dirname, './tests/server-only.stub.ts'),
        },
      ],
    },
    test: {
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
        reportsDirectory: './coverage',
        // Full-repo gate only. Shards and changed-code runs see a subset, so
        // checking these floors there is guaranteed to fail and would also
        // abort before the weekly merge job can upload blobs.
        thresholds:
          isShardRun || isChangedCodeCoverageRun
            ? undefined
            : {
                // Weekly merged report 2026-08-10 (run 31367395806):
                // 67.66% branches, 74.96% functions, 79.02% lines, 78.41% statements.
                branches: 65,
                functions: 72,
                lines: 77,
                statements: 76,
              },
      },
      // Memory hygiene: the forks pool reuses one worker process across every
      // file in a shard, and isolate:true does NOT reclaim retained references
      // left behind per test (mock call args holding rendered React/DOM trees,
      // stubbed globals/envs). Without this, residue accumulates ~hundreds of
      // MB/file and the heaviest shard OOMs (see ci.yml test-app notes).
      // clearMocks resets call history only (return values/impls survive), so
      // it's safe for beforeAll-configured mocks; unstub* only undo vi.stub*.
      clearMocks: true,
      setupFiles: [path.resolve(__dirname, './vitest.setup.ts')],
      unstubEnvs: true,
      unstubGlobals: true,
    },
  }),
);
