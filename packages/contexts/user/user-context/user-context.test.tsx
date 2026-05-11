// @vitest-environment jsdom
'use client';

import {
  UserProvider,
  useCurrentUser,
} from '@genfeedai/contexts/user/user-context/user-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useUserMock = vi.fn();
const useAuthedServiceMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
  useUser: () => useUserMock(),
}));

vi.mock('../internal/context-authed-service', () => ({
  useContextAuthedService: () => useAuthedServiceMock,
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  getPlaywrightAuthState: vi.fn(() => null),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock(
  '../../providers/protected-bootstrap/client-protected-bootstrap',
  () => ({
    loadClientProtectedBootstrap: vi.fn().mockResolvedValue(null),
  }),
);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 0, retry: false, staleTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('UserProvider', () => {
  const initialUser = {
    id: 'user_123',
    settings: {
      isFirstLogin: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_123',
    });
    useUserMock.mockReturnValue({
      user: {
        id: 'clerk_123',
        updatedAt: new Date('2026-03-17T10:00:00.000Z'),
      },
    });
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

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <UserProvider initialCurrentUser={initialUser as never}>
          <Consumer />
        </UserProvider>
      </Wrapper>,
    );

    expect(screen.getByTestId('user-id')).toHaveTextContent('user_123');
    expect(screen.getByTestId('is-first-login')).toHaveTextContent('true');
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });

  it('returns null user when auth is not loaded', () => {
    useAuthMock.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      orgId: null,
    });
    useUserMock.mockReturnValue({ user: null });

    function Consumer() {
      const { currentUser } = useCurrentUser();

      return (
        <div>
          <span data-testid="user-id">{currentUser?.id ?? 'none'}</span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <UserProvider>
          <Consumer />
        </UserProvider>
      </Wrapper>,
    );

    expect(screen.getByTestId('user-id')).toHaveTextContent('none');
  });
});
