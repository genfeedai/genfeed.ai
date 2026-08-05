import { COMMUNITY_ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/community-onboarding-system-prompt.constant';
import { describe, expect, it } from 'vitest';

describe('COMMUNITY_ONBOARDING_SYSTEM_PROMPT', () => {
  it('guides self-hosted operators through BYOK onboarding', () => {
    expect(COMMUNITY_ONBOARDING_SYSTEM_PROMPT).toContain(
      'self-hosted Genfeed instance',
    );
    expect(COMMUNITY_ONBOARDING_SYSTEM_PROMPT).toContain('Settings → API keys');
    expect(COMMUNITY_ONBOARDING_SYSTEM_PROMPT).toContain(
      'Do not attempt generation until a provider is ready',
    );
  });

  it.each([
    'free Gen credits',
    'signup gift',
    'reward',
    'credit balance',
    'present_payment_options',
    'generate_monthly_content',
  ])('does not contain cloud-only onboarding language: %s', (text) => {
    expect(COMMUNITY_ONBOARDING_SYSTEM_PROMPT.toLowerCase()).not.toContain(
      text.toLowerCase(),
    );
  });
});
