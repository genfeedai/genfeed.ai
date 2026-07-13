// @vitest-environment jsdom
'use client';

import { isSaaS } from '@genfeedai/config/deployment';
import type { AccessBootstrapState } from '@genfeedai/services/auth/auth.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import {
  AccessStateProvider,
  useAccessState,
} from '@providers/access-state/access-state.provider';
import { clearClientProtectedBootstrapCache } from '@providers/protected-bootstrap/client-protected-bootstrap';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useBrandMock = vi.fn();
const useAuthedServiceMock = vi.fn();

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => useAuthedServiceMock,
}));

vi.mock('@genfeedai/helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: vi.fn(() => null),
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isSaaS: vi.fn(() => true),
}));

vi.mock('@genfeedai/services/organization/users.service', () => ({
  UsersService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@providers/protected-bootstrap/client-protected-bootstrap', () => ({
  clearClientProtectedBootstrapCache: vi.fn(),
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
  const initialAccessState: AccessBootstrapState = {
    brandId: 'brand_123',
    creditsBalance: 100,
    hasDismissedAssetGate: false,
    hasEverHadCredits: true,
    hasGeneratedFirstAsset: false,
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
      userId: 'authProvider_123',
    });
    useBrandMock.mockReturnValue({
      brandId: 'brand_123',
      organizationId: 'org_123',
    });
    vi.mocked(isSaaS).mockReturnValue(true);
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
        <AccessStateProvider
          hasInitialBootstrap
          initialAccessState={initialAccessState}
        >
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
        <AccessStateProvider
          hasInitialBootstrap
          initialAccessState={initialAccessState}
        >
          <Consumer />
        </AccessStateProvider>
      </Wrapper>,
    );

    expect(screen.getByTestId('user-id')).toHaveTextContent('user_123');
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });

  it('treats a null bootstrap access state as hydrated empty data', () => {
    function Consumer() {
      const { accessState } = useAccessState();

      return (
        <div>
          <span data-testid="access-state">
            {accessState?.userId ?? 'none'}
          </span>
        </div>
      );
    }

    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <AccessStateProvider hasInitialBootstrap initialAccessState={null}>
          <Consumer />
        </AccessStateProvider>
      </Wrapper>,
    );

    expect(screen.getByTestId('access-state')).toHaveTextContent('none');
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });

  describe('isAssetGateLocked', () => {
    function GateConsumer() {
      const { isAssetGateLocked } = useAccessState();

      return (
        <span data-testid="asset-gate-locked">{String(isAssetGateLocked)}</span>
      );
    }

    function renderGate(
      accessState: AccessBootstrapState | null,
      { hasInitialBootstrap = true }: { hasInitialBootstrap?: boolean } = {},
    ) {
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <AccessStateProvider
            hasInitialBootstrap={hasInitialBootstrap}
            initialAccessState={hasInitialBootstrap ? accessState : undefined}
          >
            <GateConsumer />
          </AccessStateProvider>
        </Wrapper>,
      );
    }

    it('is true on SaaS when the org has not generated a first asset and has not dismissed the gate', () => {
      renderGate(initialAccessState);

      expect(screen.getByTestId('asset-gate-locked')).toHaveTextContent('true');
    });

    it('is false when not running in SaaS mode', () => {
      vi.mocked(isSaaS).mockReturnValue(false);

      renderGate(initialAccessState);

      expect(screen.getByTestId('asset-gate-locked')).toHaveTextContent(
        'false',
      );
    });

    it('is false for super admins', () => {
      renderGate({ ...initialAccessState, isSuperAdmin: true });

      expect(screen.getByTestId('asset-gate-locked')).toHaveTextContent(
        'false',
      );
    });

    it('is false once the org has generated its first asset', () => {
      renderGate({ ...initialAccessState, hasGeneratedFirstAsset: true });

      expect(screen.getByTestId('asset-gate-locked')).toHaveTextContent(
        'false',
      );
    });

    it('is false once the user has dismissed the gate', () => {
      renderGate({ ...initialAccessState, hasDismissedAssetGate: true });

      expect(screen.getByTestId('asset-gate-locked')).toHaveTextContent(
        'false',
      );
    });

    it('fails open when access state is still null', () => {
      renderGate(null);

      expect(screen.getByTestId('asset-gate-locked')).toHaveTextContent(
        'false',
      );
    });

    it('fails open while access state is still loading', () => {
      renderGate(initialAccessState, { hasInitialBootstrap: false });

      expect(screen.getByTestId('asset-gate-locked')).toHaveTextContent(
        'false',
      );
    });

    it('fails open when the cached payload predates the gate flags', () => {
      // Older cached bootstrap payloads omit hasGeneratedFirstAsset/
      // hasDismissedAssetGate entirely — both comparisons must be strict
      // `=== false`, never a truthy/falsy coercion of `undefined`.
      const legacyAccessState = {
        ...initialAccessState,
        hasDismissedAssetGate: undefined,
        hasGeneratedFirstAsset: undefined,
      } as unknown as AccessBootstrapState;

      renderGate(legacyAccessState);

      expect(screen.getByTestId('asset-gate-locked')).toHaveTextContent(
        'false',
      );
    });
  });

  describe('dismissAssetGate', () => {
    function DismissConsumer() {
      const { dismissAssetGate } = useAccessState();

      return (
        <button type="button" onClick={() => void dismissAssetGate()}>
          Dismiss
        </button>
      );
    }

    it('calls the users service and clears the client bootstrap cache', async () => {
      const dismissAssetGateApiMock = vi.fn().mockResolvedValue({});

      vi.mocked(UsersService.getInstance).mockReturnValue({
        dismissAssetGate: dismissAssetGateApiMock,
      } as unknown as UsersService);
      useAuthedServiceMock.mockImplementation(async () =>
        UsersService.getInstance('token_123'),
      );

      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <AccessStateProvider
            hasInitialBootstrap
            initialAccessState={initialAccessState}
          >
            <DismissConsumer />
          </AccessStateProvider>
        </Wrapper>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

      await waitFor(() => {
        expect(dismissAssetGateApiMock).toHaveBeenCalledTimes(1);
      });
      expect(clearClientProtectedBootstrapCache).toHaveBeenCalledTimes(1);
    });
  });
});
