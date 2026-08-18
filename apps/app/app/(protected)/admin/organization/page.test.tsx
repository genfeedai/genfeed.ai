import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/admin/organization/page.tsx', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/(protected)/admin/organization/page.tsx'),
    'utf8',
  );

  it('redirects the incomplete Organizations landing path to live org analytics', () => {
    expect(source).toContain('if (!id)');
    expect(source).toContain('redirect');
    expect(source).toContain('ADMIN.OVERVIEW.ANALYTICS_ORGANIZATIONS');
  });

  it('keeps the ?id= organization settings surface', () => {
    expect(source).toContain('OrganizationConfigPage');
  });
});
