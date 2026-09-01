// @vitest-environment jsdom
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RoutedOrganizationProvider,
  useRoutedOrganization,
} from './organization-context';

const getOrganizationsServiceMock = vi.fn();
const switchOrganizationMock = vi.fn();
const getMyOrganizationsMock = vi.fn();
const clearBootstrapCacheMock = vi.hoisted(() => vi.fn());
const cancelAndClearServicesMock = vi.hoisted(() => vi.fn());
const setRequestOrganizationIdMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
let pathname = '/alpha/~/workspace/overview';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@genfeedai/auth-client', () => ({
  isBetterAuthEnabled: () => true,
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: () => false,
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: vi.fn(),
    isLoaded: true,
    isSignedIn: true,
    orgId: 'org_bravo',
    sessionId: 'session-1',
    userId: 'user-1',
  }),
}));

vi.mock('../internal/context-authed-service', () => ({
  useContextAuthedService: () => getOrganizationsServiceMock,
}));

vi.mock(
  '../../providers/protected-bootstrap/client-protected-bootstrap',
  () => ({
    clearClientProtectedBootstrapCache: clearBootstrapCacheMock,
  }),
);

vi.mock('@genfeedai/services/core/interceptor.service', () => ({
  cancelAndClearAllServiceInstances: cancelAndClearServicesMock,
  setRequestOrganizationId: setRequestOrganizationIdMock,
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { warn: loggerWarnMock },
}));

vi.mock('@genfeedai/services/organization/organizations.service', () => ({
  OrganizationsService: { getInstance: vi.fn() },
}));

const ALPHA_ACTIVE = [
  {
    brand: null,
    id: 'org_alpha',
    isActive: true,
    isOwner: true,
    label: 'Alpha',
    slug: 'alpha',
  },
  {
    brand: null,
    id: 'org_bravo',
    isActive: false,
    isOwner: true,
    label: 'Bravo',
    slug: 'bravo',
  },
];

const BRAVO_ACTIVE = ALPHA_ACTIVE.map((organization) => ({
  ...organization,
  isActive: organization.id === 'org_bravo',
}));

function ContextProbe() {
  const context = useRoutedOrganization();

  return (
    <div>
      <span data-testid="status">{context.status}</span>
      <span data-testid="confirmed-id">
        {context.confirmedOrganizationId ?? 'none'}
      </span>
      <span data-testid="is-confirmed">{String(context.isRouteConfirmed)}</span>
      <button type="button" onClick={context.retry}>
        Retry
      </button>
    </div>
  );
}

function renderProvider(queryClient = new QueryClient()) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RoutedOrganizationProvider>
          <ContextProbe />
        </RoutedOrganizationProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('RoutedOrganizationProvider', () => {
  beforeEach(() => {
    pathname = '/alpha/~/workspace/overview';
    getOrganizationsServiceMock.mockReset();
    getOrganizationsServiceMock.mockResolvedValue({
      getMyOrganizations: getMyOrganizationsMock,
      switchOrganization: switchOrganizationMock,
    });
    getMyOrganizationsMock.mockReset();
    switchOrganizationMock.mockReset();
    switchOrganizationMock.mockResolvedValue({
      brand: { id: 'brand_alpha', label: 'Alpha Brand' },
      organization: { id: 'org_alpha', label: 'Alpha' },
    });
    clearBootstrapCacheMock.mockReset();
    cancelAndClearServicesMock.mockReset();
    setRequestOrganizationIdMock.mockReset();
    loggerWarnMock.mockReset();
    replaceMock.mockReset();
  });

  it('confirms an already-matched route before exposing its organization id', async () => {
    getMyOrganizationsMock.mockResolvedValue(ALPHA_ACTIVE);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('matched'),
    );
    expect(screen.getByTestId('confirmed-id')).toHaveTextContent('org_alpha');
    expect(screen.getByTestId('is-confirmed')).toHaveTextContent('true');
    expect(switchOrganizationMock).not.toHaveBeenCalled();
    expect(setRequestOrganizationIdMock).toHaveBeenLastCalledWith('org_alpha');
  });

  it('switches a stale backend context, clears tenant state, refreshes the token, and verifies before matching', async () => {
    const queryClient = new QueryClient();
    let resolveSwitch: (() => void) | undefined;
    switchOrganizationMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSwitch = resolve;
        }),
    );
    queryClient.setQueryData(['tenant-data'], { organizationId: 'org_bravo' });
    getMyOrganizationsMock
      .mockResolvedValueOnce(BRAVO_ACTIVE)
      .mockResolvedValueOnce(ALPHA_ACTIVE);

    renderProvider(queryClient);

    await waitFor(() =>
      expect(switchOrganizationMock).toHaveBeenCalledWith('org_alpha'),
    );
    expect(screen.getByTestId('is-confirmed')).toHaveTextContent('false');

    await act(async () => {
      resolveSwitch?.();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('matched'),
    );
    expect(getOrganizationsServiceMock).toHaveBeenCalledWith({
      forceRefresh: true,
    });
    expect(queryClient.getQueryData(['tenant-data'])).toBeUndefined();
    expect(cancelAndClearServicesMock).toHaveBeenCalled();
    expect(clearBootstrapCacheMock).toHaveBeenCalled();
    expect(setRequestOrganizationIdMock).toHaveBeenLastCalledWith('org_alpha');
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Routed organization context mismatch',
      expect.objectContaining({
        reportToSentry: false,
        tags: expect.objectContaining({
          reason: 'route-auth-mismatch',
        }),
      }),
    );
  });

  it('fails closed when the routed slug is not an authorized membership', async () => {
    pathname = '/private/~/workspace/overview';
    getMyOrganizationsMock.mockResolvedValue(ALPHA_ACTIVE);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unauthorized'),
    );
    expect(screen.getByTestId('is-confirmed')).toHaveTextContent('false');
    expect(switchOrganizationMock).not.toHaveBeenCalled();
    expect(setRequestOrganizationIdMock).toHaveBeenLastCalledWith(null);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Routed organization context mismatch',
      expect.objectContaining({
        reportToSentry: false,
        tags: expect.objectContaining({ reason: 'route-unauthorized' }),
      }),
    );
  });

  it('keeps a failed switch recoverable without confirming stale data', async () => {
    getMyOrganizationsMock
      .mockResolvedValueOnce(BRAVO_ACTIVE)
      .mockResolvedValueOnce(BRAVO_ACTIVE)
      .mockResolvedValueOnce(ALPHA_ACTIVE);
    switchOrganizationMock
      .mockRejectedValueOnce(new Error('switch rejected'))
      .mockResolvedValueOnce({
        brand: { id: 'brand_alpha', label: 'Alpha Brand' },
        organization: { id: 'org_alpha', label: 'Alpha' },
      });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('failed'),
    );
    expect(screen.getByTestId('is-confirmed')).toHaveTextContent('false');
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Routed organization context mismatch',
      expect.objectContaining({
        reportToSentry: true,
        tags: expect.objectContaining({ reason: 'switch-failed' }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('matched'),
    );
    expect(switchOrganizationMock).toHaveBeenCalledTimes(2);
  });

  it('serializes back-forward reconciliation so the final route wins exactly once', async () => {
    getMyOrganizationsMock
      .mockResolvedValueOnce(ALPHA_ACTIVE)
      .mockResolvedValueOnce(ALPHA_ACTIVE)
      .mockResolvedValueOnce(BRAVO_ACTIVE);

    const rendered = renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('matched'),
    );

    pathname = '/bravo/~/workspace/overview';
    rendered.rerender(
      <QueryClientProvider client={rendered.queryClient}>
        <RoutedOrganizationProvider>
          <ContextProbe />
        </RoutedOrganizationProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('confirmed-id')).toHaveTextContent('org_bravo'),
    );
    expect(switchOrganizationMock).toHaveBeenCalledTimes(1);
    expect(switchOrganizationMock).toHaveBeenCalledWith('org_bravo');
  });

  it('moves another tab to the authoritative organization while preserving its current surface', async () => {
    pathname = '/alpha/moonrise/studio/generate';
    getMyOrganizationsMock
      .mockResolvedValueOnce(ALPHA_ACTIVE)
      .mockResolvedValueOnce(BRAVO_ACTIVE);
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('matched'),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'genfeed:routed-organization-context:v1',
          newValue: 'changed',
        }),
      );
    });

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/bravo/~/studio/generate'),
    );
    expect(screen.getByTestId('status')).toHaveTextContent('switching');
    expect(screen.getByTestId('is-confirmed')).toHaveTextContent('false');
    expect(setRequestOrganizationIdMock).toHaveBeenLastCalledWith(null);
    expect(getOrganizationsServiceMock).toHaveBeenLastCalledWith({
      forceRefresh: true,
    });
    expect(switchOrganizationMock).not.toHaveBeenCalled();
    expect(clearBootstrapCacheMock).toHaveBeenCalled();
    expect(cancelAndClearServicesMock).toHaveBeenCalled();
  });

  it('reports failed cross-tab reconciliation to Sentry', async () => {
    getMyOrganizationsMock
      .mockResolvedValueOnce(ALPHA_ACTIVE)
      .mockRejectedValueOnce(new Error('refresh failed'));
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('matched'),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'genfeed:routed-organization-context:v1',
          newValue: 'changed',
        }),
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('failed'),
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Routed organization context mismatch',
      expect.objectContaining({
        reportToSentry: true,
        tags: expect.objectContaining({ reason: 'cross-tab-sync-failed' }),
      }),
    );
  });
});
