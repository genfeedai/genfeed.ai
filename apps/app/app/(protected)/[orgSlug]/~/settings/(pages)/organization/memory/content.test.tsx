import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('organization memory settings content', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'app/(protected)/[orgSlug]/~/settings/(pages)/organization/memory/content.tsx',
    ),
    'utf8',
  );

  it('exports the billed memory governance surface', () => {
    expect(source).toContain(
      'export default function SettingsOrganizationMemoryPage',
    );
    expect(source).toContain('listOrganization');
    expect(source).toContain("useTranslations('common.settings.memory')");
    expect(source).toContain('hasOrganizationBillingHint');
  });

  it('reads one server page from the URL and renders pagination', () => {
    expect(source).toContain("Number(searchParams.get('page')) || 1");
    expect(source).toContain('limit: ITEMS_PER_PAGE, page: currentPage');
    expect(source).toContain('<AutoPagination');
  });

  it('opens a memory entry in the right sidebar on row click', () => {
    expect(source).toContain('createSummaryRowSidebar');
    expect(source).toContain('rowSidebar={rowSidebar}');
  });
});
