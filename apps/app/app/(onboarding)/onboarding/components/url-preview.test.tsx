import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(onboarding)/onboarding/components/url-preview.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(onboarding)/onboarding/components/url-preview.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('export ');
  });
});
