import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('query-hydration.server', () => {
  it('dehydrates the request-scoped TanStack Query cache', () => {
    const source = readFileSync(
      join(process.cwd(), 'packages/server/query-hydration.server.tsx'),
      'utf8',
    );

    expect(source).toContain('makeQueryClient');
    expect(source).toContain('dehydrate(getServerQueryClient())');
    expect(source).toContain('HydrationBoundary');
    expect(source).toContain('setServerQueryData');
    expect(source).toContain('prefetchServerQuery');
  });
});
