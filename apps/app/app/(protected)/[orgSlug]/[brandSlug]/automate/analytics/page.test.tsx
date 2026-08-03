import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('automate/analytics/page.tsx', () => {
  it('permanently redirects brand Automate Analytics into Analytics Overview', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/automate/analytics/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('permanentRedirect');
    expect(source).toContain('ANALYTICS.OVERVIEW');
    expect(source).toContain('createBrandAppRoute');
    expect(source).not.toContain('AutomationAnalyticsPage');
  });
});
