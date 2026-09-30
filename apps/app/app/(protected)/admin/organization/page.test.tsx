import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/admin/organization/page.tsx', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/(protected)/admin/organization/page.tsx'),
    'utf8',
  );

  it('renders the organizations list on the landing path instead of bouncing', () => {
    expect(source).toContain('if (!id)');
    expect(source).not.toContain('redirect');
    expect(source).toContain('AdminOrganizationsLanding');
  });

  it('keeps the ?id= organization settings surface', () => {
    expect(source).toContain('OrganizationConfigPage');
  });
});
