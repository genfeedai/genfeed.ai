import * as SecureStore from 'expo-secure-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mobileAuthService } from '@/services/auth.service';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockJsonResponse(
  body: unknown,
  setCookie = 'better-auth.session_token=session-123; Path=/; HttpOnly',
) {
  mockFetch.mockResolvedValueOnce({
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'set-cookie' ? setCookie : null,
    },
    ok: true,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe('mobileAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs in with a Google ID token through Better Auth and stores the session', async () => {
    mockJsonResponse({
      token: 'better-auth-jwt',
      user: {
        email: 'user@example.com',
        id: 'user_123',
        image: null,
        name: 'User',
      },
    });

    const result = await mobileAuthService.signInWithGoogleIdToken({
      accessToken: 'google-access-token',
      idToken: 'google-id-token',
      nonce: 'nonce-123',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/auth/sign-in/social',
      expect.objectContaining({
        body: JSON.stringify({
          disableRedirect: true,
          idToken: {
            accessToken: 'google-access-token',
            nonce: 'nonce-123',
            token: 'google-id-token',
          },
          provider: 'google',
        }),
        method: 'POST',
      }),
    );
    expect(result.cookieHeader).toBe('better-auth.session_token=session-123');
    expect(result.user).toEqual({
      email: 'user@example.com',
      id: 'user_123',
      image: null,
      name: 'User',
      organizationId: null,
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'genfeed.better-auth.session-cookie',
      'better-auth.session_token=session-123',
    );
  });
});
