import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createVitest } from 'vitest/node';
import apiE2eConfig from '../vitest.config.e2e';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));

describe('API E2E workspace resolution', () => {
  it('resolves the shared utils subpath imported by publish and workflow workers', async () => {
    const runtime = await createVitest(
      { config: false, include: [], watch: false },
      {
        plugins: apiE2eConfig.plugins,
        resolve: apiE2eConfig.resolve,
        root: apiRoot,
      },
    );

    try {
      const expected = path.resolve(
        apiRoot,
        '../../../packages/utils/data/extract.util.ts',
      );
      for (const worker of [
        '../workers/src/crons/posts/post-publish-error.util.ts',
        '../workers/src/processors/api/collections/workflows/services/system-run-retry.util.ts',
      ]) {
        const resolved =
          await runtime.vite.environments.ssr.pluginContainer.resolveId(
            '@genfeedai/utils/data/extract.util',
            path.resolve(apiRoot, worker),
          );
        expect(resolved?.id).toBe(expected);
      }
    } finally {
      await runtime.close();
    }
  });
});
