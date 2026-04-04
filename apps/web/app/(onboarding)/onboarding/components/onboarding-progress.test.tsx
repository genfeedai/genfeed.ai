import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('apps/web/app/app/(onboarding)/onboarding/components/onboarding-progress.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'apps/web/app/app/(onboarding)/onboarding/components/onboarding-progress.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('export ');
  });
});
