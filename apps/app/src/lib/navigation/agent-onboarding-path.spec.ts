import { describe, expect, it } from 'vitest';
import { isAgentOnboardingPathname } from './agent-onboarding-path';

describe('isAgentOnboardingPathname', () => {
  it('matches org and brand onboarding threads', () => {
    expect(isAgentOnboardingPathname('/acme/~/agent/onboarding/thread-1')).toBe(
      true,
    );
    expect(isAgentOnboardingPathname('/acme/moonrise/agent/onboarding')).toBe(
      true,
    );
    expect(isAgentOnboardingPathname('/agent/onboarding')).toBe(true);
  });

  it('leaves ordinary agent routes alone', () => {
    expect(isAgentOnboardingPathname('/acme/~/agent/thread-1')).toBe(false);
    expect(isAgentOnboardingPathname(null)).toBe(false);
  });
});
