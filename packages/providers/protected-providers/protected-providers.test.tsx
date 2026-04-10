// @vitest-environment jsdom
'use client';

import ProtectedProviders from '@providers/protected-providers/protected-providers';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const getPlaywrightAuthStateMock = vi.fn();
const hasPlaywrightJwtTokenMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
  useUser: () => ({ user: null }),
}));

vi.mock('@genfeedai/helpers/auth/clerk.helper', () => ({
  getPlaywrightAuthState: () => getPlaywrightAuthStateMock(),
  hasPlaywrightJwtToken: () => hasPlaywrightJwtTokenMock(),
  resolveClerkToken: vi.fn().mockResolvedValue('jwt-token'),
}));

vi.mock('@genfeedai/contexts/ui/asset-selection-context', () => ({
  AssetSelectionProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock('@genfeedai/contexts/ui/background-task-context', () => ({
  BackgroundTaskProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  BrandProvider: ({ children }: { children: React.ReactNode }) => children,
  useBrand: () => ({ organizationId: null, settings: null }),
}));

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  UserProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@providers/access-state/access-state.provider', () => ({
  AccessStateProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock('@providers/api-status/api-status.provider', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@providers/elements/elements.provider', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  GlobalModalsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock('@providers/promptbar/promptbar.provider', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  clearTokenCache: vi.fn(),
  useAuthedService: () => vi.fn(),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

describe('ProtectedProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPlaywrightAuthStateMock.mockReturnValue(null);
    hasPlaywrightJwtTokenMock.mockReturnValue(false);
    useAuthMock.mockReturnValue({
      getToken: vi.fn().mockResolvedValue('jwt-token'),
      isLoaded: true,
      isSignedIn: true,
      orgId: null,
      sessionId: 'session-1',
      userId: 'user-1',
    });
  });

  it('renders children through the provider stack', async () => {
    render(
      <ProtectedProviders>
        <span data-testid="child">hello</span>
      </ProtectedProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('hello');
    });
  });

  it('always renders ElementsProvider and PromptBarProvider regardless of enabled flags', async () => {
    const { container } = render(
      <ProtectedProviders
        includeElementsProvider={false}
        includePromptBarProvider={false}
      >
        <span data-testid="child">content</span>
      </ProtectedProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
    expect(container.firstChild).toBeTruthy();
  });

  it('conditionally wraps AssetSelectionProvider', async () => {
    render(
      <ProtectedProviders includeAssetSelectionProvider={false}>
        <span data-testid="child">no-assets</span>
      </ProtectedProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('no-assets');
    });
  });

  it('does not render protected children until a jwt token is available', async () => {
    useAuthMock.mockReturnValue({
      getToken: vi.fn().mockResolvedValue(null),
      isLoaded: true,
      isSignedIn: true,
      orgId: null,
      sessionId: 'session-1',
      userId: 'user-1',
    });

    render(
      <ProtectedProviders>
        <span data-testid="child">blocked</span>
      </ProtectedProviders>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    });
  });

  it('renders protected children when playwright auth has a cached jwt token', async () => {
    getPlaywrightAuthStateMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org-1',
      publicMetadata: { brand: 'brand-1' },
      userId: 'user-1',
    });
    hasPlaywrightJwtTokenMock.mockReturnValue(true);
    useAuthMock.mockReturnValue({
      getToken: vi.fn().mockResolvedValue(null),
      isLoaded: false,
      isSignedIn: false,
      orgId: null,
      sessionId: null,
      userId: null,
    });

    render(
      <ProtectedProviders>
        <span data-testid="child">playwright-auth</span>
      </ProtectedProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toHaveTextContent('playwright-auth');
    });
  });
});
