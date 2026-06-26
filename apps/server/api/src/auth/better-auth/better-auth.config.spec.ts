import { describe, expect, it } from 'vitest';
import {
  parseTrustedOrigins,
  resolveBetterAuthBaseUrl,
} from './better-auth.config';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';

describe('Better Auth config', () => {
  it('uses the API origin as the production OAuth callback base', () => {
    const baseUrl = resolveBetterAuthBaseUrl('https://api.genfeed.ai', 3010);

    expect(`${baseUrl}${BETTER_AUTH_BASE_PATH}/callback/google`).toBe(
      'https://api.genfeed.ai/v1/auth/callback/google',
    );
  });

  it('accepts console.genfeed.ai as a trusted post-auth callback origin', () => {
    expect(
      parseTrustedOrigins(
        'https://genfeed.ai, https://app.genfeed.ai, https://console.genfeed.ai',
      ),
    ).toContain('https://console.genfeed.ai');
  });
});
