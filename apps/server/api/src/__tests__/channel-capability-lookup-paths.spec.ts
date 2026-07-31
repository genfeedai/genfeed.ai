import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listChannelCapabilities } from '@api-types/contracts/channel-capabilities.contract';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for fabricated helper lookup paths.
 *
 * A `lookupPath` is the endpoint the composer calls to populate a picker — the
 * list of YouTube channels, Instagram pages, Pinterest boards. The catalog is
 * plain data, so nothing stops a path from being invented: seven of the eight
 * declared paths named `/integrations/...` routes that have never existed, and
 * because no consumer had wired the field up yet, every test still passed.
 *
 * The committed OpenAPI artifact is the API's own route inventory and is itself
 * drift-checked in CI, which makes it the right oracle here: if a helper claims
 * a path, the API must actually serve it.
 */
describe('channel capability lookup paths', () => {
  const specPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'openapi',
    'openapi.json',
  );

  const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
    paths: Record<string, unknown>;
  };

  const declaredPaths = listChannelCapabilities({
    includeHidden: true,
    includePlanned: true,
  }).flatMap((capability) =>
    capability.helpers
      .filter((helper) => helper.lookupPath)
      .map((helper) => ({
        capability: capability.label,
        helper: helper.key,
        lookupPath: helper.lookupPath as string,
      })),
  );

  it('declares at least one lookup path', () => {
    // Without this the suite would pass vacuously if every path were deleted.
    expect(declaredPaths.length).toBeGreaterThan(0);
  });

  it.each(declaredPaths)(
    '$capability helper $helper resolves to a real API route',
    ({ lookupPath }) => {
      expect(Object.keys(spec.paths)).toContain(lookupPath);
    },
  );
});
