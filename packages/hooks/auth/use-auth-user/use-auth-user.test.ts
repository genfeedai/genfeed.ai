import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthUser } from './use-auth-user';

const authClientMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@genfeedai/auth-client', () => ({
  authClient: authClientMocks,
}));

describe('useAuthUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drops a legacy Clerk avatar from a Better Auth session', () => {
    authClientMocks.useSession.mockReturnValue({
      data: {
        user: {
          email: 'vincent@genfeed.ai',
          id: 'user-1',
          image: 'https://img.clerk.com/proxy/avatar',
          name: 'Vincent Driessen',
        },
      },
      isPending: false,
    });

    const { result } = renderHook(() => useAuthUser());

    expect(result.current.user?.imageUrl).toBeNull();
  });

  it('keeps a current provider avatar from a Better Auth session', () => {
    authClientMocks.useSession.mockReturnValue({
      data: {
        user: {
          email: 'vincent@genfeed.ai',
          id: 'user-1',
          image: 'https://lh3.googleusercontent.com/avatar.png',
          name: 'Vincent Driessen',
        },
      },
      isPending: false,
    });

    const { result } = renderHook(() => useAuthUser());

    expect(result.current.user?.imageUrl).toBe(
      'https://lh3.googleusercontent.com/avatar.png',
    );
  });
});
