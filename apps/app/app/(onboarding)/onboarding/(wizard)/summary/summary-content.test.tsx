import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(onboarding)/onboarding/(wizard)/summary/summary-content.tsx', () => {
  it('renders install summary content with default access guidance and a real cloud handoff', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(onboarding)/onboarding/(wizard)/summary/summary-content.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('Install summary');
    expect(source).toContain('Default access');
    expect(source).toContain('Add my own API keys');
    expect(source).toContain('Want Genfeed Cloud');
    expect(source).toContain('Continue with self-hosted');
    expect(source).toContain('Continue to Genfeed Cloud');
  });
});
