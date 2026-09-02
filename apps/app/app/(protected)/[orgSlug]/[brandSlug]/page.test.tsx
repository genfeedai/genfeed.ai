import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it } from 'vitest';

const PAGE_PATH = 'app/(protected)/[orgSlug]/[brandSlug]/page.tsx';

assertSourceHasExport(PAGE_PATH);

describe('brand root page', () => {
  it('lands on the existing brand-scoped Workspace home instead of 404', () => {
    const source = readFileSync(join(process.cwd(), PAGE_PATH), 'utf8');

    expect(source).toContain('createBrandAppRoute');
    expect(source).toContain('APP_ROUTES.WORKSPACE.ROOT');
    expect(source).toContain('redirect(');
    expect(
      createBrandAppRoute('demo', 'FUDNEWS', APP_ROUTES.WORKSPACE.ROOT),
    ).toBe('/demo/FUDNEWS/workspace');
  });
});
