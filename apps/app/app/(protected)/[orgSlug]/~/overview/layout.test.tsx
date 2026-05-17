import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/[orgSlug]/~/overview/layout.tsx', () => {
  it('wraps the organization overview with analytics context', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/[orgSlug]/~/overview/layout.tsx'),
      'utf8',
    );

    expect(source).toContain('FeatureGate');
    expect(source).toContain('AnalyticsProvider');
  });
});
