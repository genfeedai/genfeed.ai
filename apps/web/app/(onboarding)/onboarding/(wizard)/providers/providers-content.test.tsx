import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROVIDERS_SOURCE_FILES = [
  'app/(onboarding)/onboarding/(wizard)/providers/providers-content.tsx',
  'app/(onboarding)/onboarding/(wizard)/providers/providers-status-card.tsx',
  'app/(onboarding)/onboarding/(wizard)/providers/providers-tool-list.tsx',
  'app/(onboarding)/onboarding/(wizard)/providers/providers-server-list.tsx',
  'app/(onboarding)/onboarding/(wizard)/providers/providers-action-bar.tsx',
];

describe('app/(onboarding)/onboarding/(wizard)/providers/providers-content.tsx', () => {
  it('renders local CLI guidance alongside server, BYOK, and cloud access paths', () => {
    const source = PROVIDERS_SOURCE_FILES.map((filePath) =>
      readFileSync(join(process.cwd(), filePath), 'utf8'),
    ).join('\n');

    expect(source).toContain('Default access');
    expect(source).toContain('Local agent tools');
    expect(source).toContain('Codex CLI');
    expect(source).toContain('Claude CLI');
    expect(source).toContain('Server-configured providers');
    expect(source).toContain('Add my own API keys');
    expect(source).toContain('Continue with server defaults');
    expect(source).toContain('Use Genfeed Cloud');
  });
});
