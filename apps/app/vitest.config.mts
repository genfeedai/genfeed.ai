import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../vitest.config.mts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
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
