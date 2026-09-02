import { COMMUNITY_ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/community-onboarding-system-prompt.constant';
import { describe, expect, it } from 'vitest';

describe('COMMUNITY_ONBOARDING_SYSTEM_PROMPT', () => {
  it('guides self-hosted operators through BYOK onboarding', () => {
    expect(COMMUNITY_ONBOARDING_SYSTEM_PROMPT).toContain(
      'self-hosted Genfeed instance',
    );
    expect(COMMUNITY_ONBOARDING_SYSTEM_PROMPT).toContain('Settings → API keys');
    expect(COMMUNITY_ONBOARDING_SYSTEM_PROMPT).toContain(
      'Do not attempt image generation until providerReadiness reports an image-capable provider',
    );
  });

  it('requires an image-capable provider before the first generation', () => {
    expect(COMMUNITY_ONBOARDING_SYSTEM_PROMPT).toContain(
      'Image generation needs an image-capable provider: fal, Replicate, or Leonardo.',
    );
    // A text-only setup must be routed back to the existing API-key checklist
    // rather than being told a configured provider is ready to generate.
    expect(COMMUNITY_ONBOARDING_SYSTEM_PROMPT).toContain(
      'When providers are configured but none is image-capable',
    );
    expect(COMMUNITY_ONBOARDING_SYSTEM_PROMPT).toContain(
      'Only after providerReadiness confirms an image-capable provider, use generate_image',
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
