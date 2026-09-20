import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(onboarding)/onboarding/(wizard)/success/success-content.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(onboarding)/onboarding/(wizard)/success/success-content.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('export ');
    expect(source).toContain('Starter Credits Ready');
    expect(source).toContain('ONBOARDING_SIGNUP_GIFT_CREDITS');
    expect(source).toContain('useCompleteOnboarding');
    expect(source).toContain('completeOnboarding()');

    // Entering the workspace is shared with the Expert Path first-system step.
    const completeOnboardingSource = readFileSync(
      join(
        process.cwd(),
        'app/(onboarding)/onboarding/(wizard)/_expert/use-complete-onboarding.hook.ts',
      ),
      'utf8',
    );
    expect(completeOnboardingSource).toContain('forceRefresh: true');
    expect(completeOnboardingSource).toContain('user?.reload()');
    expect(completeOnboardingSource).toContain(
      "createBrandAppRoute(orgSlug, brandSlug, '/workspace')",
    );
    expect(source).toContain(
      'window.location.assign(APP_ROUTES.WORKSPACE.OVERVIEW)',
    );
  });
});
