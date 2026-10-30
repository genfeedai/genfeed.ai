import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  readFileSync(join(__dirname, relativePath), 'utf8');

describe('Admin organizations routes', () => {
  it('renders the organizations list at /admin/organizations without awaiting route inputs', () => {
    const source = read('page.tsx');

    expect(source).toContain('<AdminOrganizationsLanding />');
    expect(source).not.toMatch(/await\s+(params|searchParams)/);
    expect(source).not.toContain('redirect');
  });

  it('renders the organization detail page at /admin/organizations/:id from the route param', () => {
    const page = read('[id]/page.tsx');
    const detail = read('[id]/organization-detail-page.tsx');

    expect(page).toContain('<OrganizationDetailPage />');
    expect(page).not.toMatch(/await\s+(params|searchParams)/);
    expect(detail).toContain('useParams');
    expect(detail).not.toContain("get('id')");
  });
});
