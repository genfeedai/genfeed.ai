import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as PageModule from '@app/(protected)/[orgSlug]/[brandSlug]/analytics/brands/[id]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('app/(protected)/analytics/brands/[id]/page', PageModule);

describe('synchronous route shell', () => {
  it('renders the client route without awaiting URL props', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/analytics/brands/[id]/page.tsx',
      ),
      'utf8',
    );
    expect(source).toMatch(/export default function/);
    expect(source).not.toMatch(/await (params|searchParams)/);
    expect(source).toContain('<AnalyticsBrandDetailRoute />');
  });
});
