import { vi } from 'vitest';

export function createAuthClient() {
  return {
    $fetch: vi.fn().mockResolvedValue({ data: null, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: null, error: null }),
    requestPasswordReset: vi
      .fn()
      .mockResolvedValue({ data: null, error: null }),
    resetPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
    signIn: { email: vi.fn(), magicLink: vi.fn(), social: vi.fn() },
    signOut: vi.fn(),
    signUp: { email: vi.fn() },
    useSession: vi.fn(() => ({
      data: null,
      error: null,
      isPending: false,
    })),
  };
}
