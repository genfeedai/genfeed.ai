// @vitest-environment jsdom
'use client';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useUserMock = vi.fn();
const useAuthedServiceMock = vi.fn();
const useResourceMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
  useUser: () => useUserMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => useAuthedServiceMock,
}));

vi.mock('@genfeedai/hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => useResourceMock(...args),
}));

describe('UserProvider', () => {
  let UserProvider: typeof import('@genfeedai/contexts/user/user-context/user-context').UserProvider;
  let useCurrentUser: typeof import('@genfeedai/contexts/user/user-context/user-context').useCurrentUser;

  const initialUser = {
    id: 'user_123',
    settings: {
      isFirstLogin: true,
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    useUserMock.mockReturnValue({
      user: {
        id: 'clerk_123',
        updatedAt: new Date('2026-03-17T10:00:00.000Z'),
      },
    });
    useResourceMock.mockImplementation(
      (_fetcher: unknown, options?: Record<string, unknown>) => ({
        data: options?.initialData ?? null,
        isLoading: false,
        mutate: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
      }),
    );

    const module = await import(
      '@genfeedai/contexts/user/user-context/user-context'
    );
    UserProvider = module.UserProvider;
    useCurrentUser = module.useCurrentUser;
  });

  it('exposes the bootstrap user without forcing a findMe request on mount', () => {
    function Consumer() {
      const { currentUser, isFirstLogin } = useCurrentUser();

      return (
        <div>
          <span data-testid="user-id">{currentUser?.id}</span>
          <span data-testid="is-first-login">{String(isFirstLogin)}</span>
        </div>
      );
    }

    render(
      <UserProvider initialCurrentUser={initialUser as never}>
        <Consumer />
      </UserProvider>,
    );

    expect(screen.getByTestId('user-id')).toHaveTextContent('user_123');
    expect(screen.getByTestId('is-first-login')).toHaveTextContent('true');
    expect(useResourceMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        enabled: true,
        initialData: expect.objectContaining({ id: 'user_123' }),
        revalidateOnMount: false,
      }),
    );
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });
});
