import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(onboarding)/onboarding/(wizard)/providers/providers-content.tsx', () => {
  it('renders local CLI guidance alongside hosted providers', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(onboarding)/onboarding/(wizard)/providers/providers-content.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('Local agent tools');
    expect(source).toContain('Codex CLI');
    expect(source).toContain('Claude CLI');
    expect(source).toContain('Hosted providers');
  });
});
