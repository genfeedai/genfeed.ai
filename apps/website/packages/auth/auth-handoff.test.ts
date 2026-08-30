import { describe, expect, it, vi } from 'vitest';
import { buildAuthHandoffHref } from './auth-handoff';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.genfeed.ai' } },
}));

describe('buildAuthHandoffHref', () => {
  it('preserves login callback and sign-up token outputs', () => {
    expect(buildAuthHandoffHref('login', 'brandOsToken', 'token-1')).toBe(
      'https://app.genfeed.ai/login?callbackUrl=%2Fonboarding%2Fpost-signup%3FbrandOsToken%3Dtoken-1',
    );
    expect(buildAuthHandoffHref('sign-up', 'clipToolToken', 'token-2')).toBe(
      'https://app.genfeed.ai/sign-up?clipToolToken=token-2',
    );
  });
});
