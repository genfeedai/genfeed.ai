import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('apps/app/app/(onboarding)/onboarding/(wizard)/brand/brand-content.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'apps/app/app/(onboarding)/onboarding/(wizard)/brand/brand-content.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('export ');
  });
});
