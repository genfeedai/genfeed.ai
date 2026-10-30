import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAdminRouteConvention } from './check-admin-route-convention';

const ADMIN = 'apps/app/app/(protected)/admin';
const ROUTES = 'packages/contracts/src/constants/routes.constant.ts';
const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'admin-route-convention-'));
  testDirs.push(rootDir);

  for (const [file, source] of Object.entries({
    [ROUTES]: "ORGANIZATIONS: '/admin/organizations',\n",
    ...files,
  })) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

describe('admin route convention guard', () => {
  it('accepts a list with a detail beside it', () => {
    const rootDir = fixture({
      [`${ADMIN}/organizations/page.tsx`]: '',
      [`${ADMIN}/organizations/[id]/page.tsx`]: '',
    });

    expect(checkAdminRouteConvention({ rootDir })).toEqual([]);
  });

  it('accepts a detail under a view segment that has its own list', () => {
    const rootDir = fixture({
      [`${ADMIN}/content/ingredients/[type]/page.tsx`]: '',
      [`${ADMIN}/content/ingredients/[type]/[id]/page.tsx`]: '',
      [`${ADMIN}/automation/models/[type]/page.tsx`]: '',
      [`${ADMIN}/automation/models/[type]/[modelId]/page.tsx`]: '',
    });

    expect(checkAdminRouteConvention({ rootDir })).toEqual([]);
  });

  it('rejects a detail page with no list', () => {
    const rootDir = fixture({
      [`${ADMIN}/images/[id]/page.tsx`]: '',
    });

    expect(checkAdminRouteConvention({ rootDir })).toEqual([
      {
        expectedList: `${ADMIN}/images/page.tsx`,
        kind: 'detail-without-list',
        page: `${ADMIN}/images/[id]/page.tsx`,
      },
    ]);
  });

  it('ignores non-id dynamic segments such as a platform', () => {
    const rootDir = fixture({
      [`${ADMIN}/brands/page.tsx`]: '',
      [`${ADMIN}/brands/[id]/page.tsx`]: '',
      [`${ADMIN}/brands/[id]/platforms/[platform]/page.tsx`]: '',
    });

    expect(checkAdminRouteConvention({ rootDir })).toEqual([]);
  });

  it('rejects an id in an admin route constant but allows query filters', () => {
    const rootDir = fixture({
      [ROUTES]:
        "ORGANIZATION: '/admin/organization?id=',\nPOSTS: '/admin/content/posts?organization=',\n",
    });

    expect(checkAdminRouteConvention({ rootDir })).toEqual([
      {
        file: ROUTES,
        kind: 'query-id-route',
        line: 1,
        match: "'/admin/organization?id='",
      },
    ]);
  });
});
