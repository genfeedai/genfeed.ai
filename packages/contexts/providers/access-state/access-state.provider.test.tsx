// @vitest-environment jsdom
'use client';

import {
  AccessStateProvider,
  useAccessState,
} from '@providers/access-state/access-state.provider';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useBrandMock = vi.fn();
const useAuthedServiceMock = vi.fn();
const useResourceMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => useAuthedServiceMock,
}));

vi.mock('@genfeedai/hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => useResourceMock(...args),
}));

describe('AccessStateProvider', () => {
  const refreshMock = vi.fn().mockResolvedValue(undefined);
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
      userId: 'clerk_123',
    });
    useBrandMock.mockReturnValue({
      brandId: 'brand_123',
      organizationId: 'org_123',
    });
    useResourceMock.mockImplementation(
      (_fetcher: unknown, options?: Record<string, unknown>) => ({
        data: options?.initialData ?? null,
        isLoading: false,
        refresh: refreshMock,
      }),
    );
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

    render(
      <AccessStateProvider initialAccessState={initialAccessState}>
        <Consumer />
      </AccessStateProvider>,
    );

    expect(screen.getByTestId('subscribed')).toHaveTextContent('false');
    expect(screen.getByTestId('byok')).toHaveTextContent('false');
    expect(screen.getByTestId('payg')).toHaveTextContent('true');
    expect(screen.getByTestId('access')).toHaveTextContent('false');
    expect(screen.getByTestId('needs-onboarding')).toHaveTextContent('true');
  });

  it('uses bootstrap state instead of forcing a fresh auth bootstrap fetch', () => {
    render(
      <AccessStateProvider initialAccessState={initialAccessState}>
        <div>child</div>
      </AccessStateProvider>,
    );

    expect(useResourceMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        enabled: true,
        initialData: initialAccessState,
        revalidateOnMount: false,
      }),
    );
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });
});
