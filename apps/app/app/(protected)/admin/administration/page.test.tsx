import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/admin/administration/page.tsx', () => {
  it('permanently redirects bare /admin/administration to Organizations', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/admin/administration/page.tsx'),
      'utf8',
    );

    expect(source).toContain(
      'permanentRedirect(APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ORGANIZATIONS)',
    );
  });
});
