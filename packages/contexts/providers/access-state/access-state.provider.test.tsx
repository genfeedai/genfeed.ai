// @vitest-environment jsdom
'use client';

import {
  AccessStateProvider,
  useAccessState,
} from '@providers/access-state/access-state.provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useBrandMock = vi.fn();
const useAuthedServiceMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => useAuthedServiceMock,
}));

vi.mock('@genfeedai/helpers/auth/clerk.helper', () => ({
  getPlaywrightAuthState: vi.fn(() => null),
}));

vi.mock('@providers/protected-bootstrap/client-protected-bootstrap', () => ({
  loadClientProtectedBootstrap: vi.fn().mockResolvedValue(null),
}));

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

describe('AccessStateProvider', () => {
  const initialAccessState = {
    brandId: 'brand_123',
    creditsBalance: 100,
    hasEverHadCredits: true,
    isOnboardingCompleted: false,
    isSuperAdmin: false,
    organizationId: 'org_123',
    subscriptionStatus: 'canceled',
    subscriptionTier: 'payg',
    userId: 'user_123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_123',
      userId: 'clerk_123',
    });
    useBrandMock.mockReturnValue({
      brandId: 'brand_123',
      organizationId: 'org_123',
    });
  });

  it('derives access flags from bootstrap state', () => {
    function Consumer() {
      const {
        canAccessApp,
        hasPaygCredits,
        isByok,
        isSubscribed,
        needsOnboarding,
      } = useAccessState();

      return (
        <div>
          <span data-testid="subscribed">{String(isSubscribed)}</span>
          <span data-testid="byok">{String(isByok)}</span>
          <span data-testid="payg">{String(hasPaygCredits)}</span>
          <span data-testid="access">{String(canAccessApp)}</span>
          <span data-testid="needs-onboarding">{String(needsOnboarding)}</span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <AccessStateProvider initialAccessState={initialAccessState}>
          <Consumer />
        </AccessStateProvider>
      </Wrapper>,
    );

    expect(screen.getByTestId('subscribed')).toHaveTextContent('false');
    expect(screen.getByTestId('byok')).toHaveTextContent('false');
    expect(screen.getByTestId('payg')).toHaveTextContent('true');
    expect(screen.getByTestId('access')).toHaveTextContent('false');
    expect(screen.getByTestId('needs-onboarding')).toHaveTextContent('true');
  });

  it('uses bootstrap state without forcing a fresh fetch on mount', () => {
    function Consumer() {
      const { accessState } = useAccessState();

      return (
        <div>
          <span data-testid="user-id">{accessState?.userId}</span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <AccessStateProvider initialAccessState={initialAccessState}>
          <Consumer />
        </AccessStateProvider>
      </Wrapper>,
    );

<<<<<<< HEAD
    expect(screen.getByTestId('user-id')).toHaveTextContent('user_123');
=======
    expect(useResourceMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        enabled: true,
        cacheKey: 'access-state:org_123:brand_123:clerk_123',
        cacheTimeMs: 60_000,
        initialData: initialAccessState,
        revalidateOnMount: false,
      }),
    );
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });
});
