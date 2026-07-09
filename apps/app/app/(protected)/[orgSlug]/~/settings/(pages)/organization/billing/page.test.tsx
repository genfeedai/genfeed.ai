import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/[orgSlug]/~/settings/(pages)/organization/billing/page.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/~/settings/(pages)/organization/billing/page.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('export ');
  });

  it('keeps the legacy settings page hard-cut to the organization settings 404 shim', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/~/settings/(pages)/organization/billing/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('LegacyOrganizationSettingsNotFound');
  });
});

describe('app/(protected)/[orgSlug]/~/settings/(organization)/billing/page.tsx', () => {
  it('keeps the non-EE credits redirect scoped to the active organization', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/~/settings/(organization)/billing/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('createOrganizationAppRoute');
    expect(source).toContain('APP_ROUTES.SETTINGS.CREDITS');
    expect(source).toContain('orgSlug');
  });
});
