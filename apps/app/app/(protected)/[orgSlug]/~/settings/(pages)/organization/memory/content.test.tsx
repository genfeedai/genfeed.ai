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
});
