// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedLayoutClient from './protected-layout-client';

const platformState = vi.hoisted(() => ({
  flags: { studio: false },
  isReady: false,
  isUnavailable: false,
}));
const routeGate = vi.hoisted(() => vi.fn());
const notifyChanged = vi.hoisted(() => vi.fn());
const receiveFlags = vi.hoisted(() => vi.fn());

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@/lib/platform-flags/use-platform-flags', () => ({
  usePlatformFlags: () => platformState,
}));
vi.mock('@/lib/platform-flags/platform-flags-sync', () => ({
  notifyPlatformFlagsChanged: notifyChanged,
}));
vi.mock('@hooks/auth/use-auth-user', () => ({
  useAuthUser: () => ({ user: null }),
}));
vi.mock('@/lib/analytics', () => ({ identifyAnalyticsUser: vi.fn() }));
vi.mock('@/lib/workspace-shell/workspace-shell-telemetry', () => ({
  captureWorkspaceShellSession: vi.fn(),
}));
vi.mock('@genfeedai/auth-client', () => ({ SessionKeepAlive: () => null }));
vi.mock('./api-auth-bridge', () => ({ default: () => null }));
vi.mock('@hooks/feature-flags/provider', () => ({
  FeatureFlagProvider: ({
    children,
    defaults,
  }: {
    children: ReactNode;
    defaults: unknown;
  }) => {
    receiveFlags(defaults);
    return children;
  },
}));
vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    RoutedOrganizationProvider: ({ children }: { children: ReactNode }) =>
      children,
  }),
);
vi.mock('./routed-organization-boundary', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./platform-module-route-gate', () => ({
  default: ({ children }: { children: ReactNode }) => {
    routeGate();
    return children;
  },
}));
vi.mock('@app-components/app-protected-layout', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@ui/error', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@ui/loading/fallback/LazyLoadingFallback', () => ({
  default: () => <div role="status">Loading settings</div>,
}));
vi.mock('@ui/error/ErrorFallback', () => ({
  ErrorFallback: ({
    title,
    resetErrorBoundary,
  }: {
    title: string;
    resetErrorBoundary: () => void;
  }) => (
    <div role="alert">
      {title}
      <button type="button" onClick={resetErrorBoundary}>
        Try again
      </button>
    </div>
  ),
}));

describe('protected shell platform flags recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformState.isReady = false;
    platformState.isUnavailable = false;
  });

  it('waits for confirmed flags before mounting the module route gate', () => {
    render(
      <ProtectedLayoutClient>
        <p>Workspace</p>
      </ProtectedLayoutClient>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
    expect(routeGate).not.toHaveBeenCalled();
    expect(receiveFlags).not.toHaveBeenCalled();
  });

  it('offers retry after an outage and mounts the shell after recovery', () => {
    platformState.isUnavailable = true;
    const { rerender } = render(
      <ProtectedLayoutClient>
        <p>Workspace</p>
      </ProtectedLayoutClient>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Workspace settings unavailable',
    );
    expect(routeGate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(notifyChanged).toHaveBeenCalledOnce();

    platformState.isReady = true;
    platformState.isUnavailable = false;
    rerender(
      <ProtectedLayoutClient>
        <p>Workspace</p>
      </ProtectedLayoutClient>,
    );

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(routeGate).toHaveBeenCalled();
    expect(receiveFlags).toHaveBeenCalledWith({ studio: false });
  });
});
