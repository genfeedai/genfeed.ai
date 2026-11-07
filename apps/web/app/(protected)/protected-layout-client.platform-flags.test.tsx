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
// Times the shell asked the platform-flags sync to re-read after an outage.
const flagsSync = vi.hoisted(() => ({ retries: 0 }));

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
  notifyPlatformFlagsChanged: () => {
    flagsSync.retries += 1;
  },
}));
vi.mock('@/hooks/auth/use-auth-user', () => ({
  useAuthUser: () => ({ user: null }),
}));
vi.mock('@/lib/analytics', () => ({ identifyAnalyticsUser: () => undefined }));
vi.mock('@/lib/workspace-shell/workspace-shell-telemetry', () => ({
  captureWorkspaceShellSession: () => undefined,
}));
// Boot pieces render a marker so the tests can see what is mounted.
vi.mock('@genfeedai/auth-client', () => ({
  SessionKeepAlive: () => <span>Session keep-alive</span>,
}));
vi.mock('./api-auth-bridge', () => ({
  default: () => <span>API auth bridge</span>,
}));
vi.mock('@/hooks/feature-flags/provider', () => ({
  FeatureFlagProvider: ({
    children,
    defaults,
  }: {
    children: ReactNode;
    defaults: unknown;
  }) => (
    <section aria-label="Feature flags">
      <output>{JSON.stringify(defaults)}</output>
      {children}
    </section>
  ),
}));
vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    RoutedOrganizationProvider: ({ children }: { children: ReactNode }) => (
      <section aria-label="Organization scope">{children}</section>
    ),
  }),
);
vi.mock('./routed-organization-boundary', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./platform-module-route-gate', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section aria-label="Module route gate">{children}</section>
  ),
}));
vi.mock('@/components/layouts/protected/app-protected-layout', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@ui/display/error-boundary/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
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
    flagsSync.retries = 0;
    platformState.isReady = false;
    platformState.isUnavailable = false;
  });

  it('waits for confirmed flags before mounting the module route gate', () => {
    render(
      <ProtectedLayoutClient>
        <p>Workspace</p>
      </ProtectedLayoutClient>,
    );

    expect(
      screen.getByRole('status', { name: 'Loading your workspace' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Module route gate' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Feature flags' }),
    ).not.toBeInTheDocument();
  });

  it('starts session, auth bridge and organization boot while flags load', () => {
    render(
      <ProtectedLayoutClient>
        <p>Workspace</p>
      </ProtectedLayoutClient>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Session keep-alive')).toBeInTheDocument();
    expect(screen.getByText('API auth bridge')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Organization scope' }),
    ).toBeInTheDocument();
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
    expect(
      screen.queryByRole('region', { name: 'Module route gate' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(flagsSync.retries).toBe(1);

    platformState.isReady = true;
    platformState.isUnavailable = false;
    rerender(
      <ProtectedLayoutClient>
        <p>Workspace</p>
      </ProtectedLayoutClient>,
    );

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Module route gate' }),
    ).toHaveTextContent('Workspace');
    expect(
      screen.getByRole('region', { name: 'Feature flags' }),
    ).toHaveTextContent('{"studio":false}');
  });
});
