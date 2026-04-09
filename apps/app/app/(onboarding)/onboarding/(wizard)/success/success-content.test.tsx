import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('apps/app/app/(onboarding)/onboarding/(wizard)/success/success-content.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'apps/app/app/(onboarding)/onboarding/(wizard)/success/success-content.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('export ');
    expect(source).toContain('Starter Credits Ready');
    expect(source).toContain('ONBOARDING_SIGNUP_GIFT_CREDITS');
    expect(source).toContain('forceRefresh: true');
    expect(source).toContain('user?.reload()');
    expect(source).toContain("window.location.assign('/workspace/overview')");
  });
});
