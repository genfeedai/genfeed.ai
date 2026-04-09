import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('apps/app/app/(onboarding)/onboarding/(wizard)/summary/summary-content.tsx', () => {
  it('renders cloud upsell and install summary content', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'apps/app/app/(onboarding)/onboarding/(wizard)/summary/summary-content.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('Install summary');
    expect(source).toContain('Genfeed Cloud');
    expect(source).toContain('Continue with self-hosted');
  });
});
