import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(onboarding)/onboarding/(wizard)/summary/summary-content.tsx', () => {
  it('renders install summary content with a secondary cloud note', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(onboarding)/onboarding/(wizard)/summary/summary-content.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('Install summary');
    expect(source).toContain('Don&apos;t know what you&apos;re looking for?');
    expect(source).toContain('Use our cloud solution');
    expect(source).toContain('Continue with self-hosted');
  });
});
