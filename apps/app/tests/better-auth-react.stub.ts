import { vi } from 'vitest';

export function createAuthClient() {
  return {
    $fetch: vi.fn().mockResolvedValue({ data: null }),
    getSession: vi.fn().mockResolvedValue({ data: null }),
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
