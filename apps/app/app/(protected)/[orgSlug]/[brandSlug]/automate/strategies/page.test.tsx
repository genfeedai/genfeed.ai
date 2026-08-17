import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('automate/strategies/page.tsx', () => {
  it('permanently redirects the retired Strategies URL into Autopilot', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/automate/strategies/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('permanentRedirect');
    expect(source).toContain('AUTOMATE.AUTOPILOT');
    expect(source).toContain('createBrandAppRoute');
    expect(source).not.toContain('AgentStrategiesPage');
  });
});
