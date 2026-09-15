import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const navigation = vi.hoisted(() => ({
  pathname: '/acme/~/analytics/brands/brand-2',
}));

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => router,
  useSearchParams: () =>
    new URLSearchParams('startDate=2024-06-01&endDate=2024-06-30'),
}));

// Every mocked hook below returns a stable, hoisted reference rather than a
// fresh object per call — matching how the real (memoized) hooks behave.
// Returning new objects/functions on every render would make the adapter's
// own `useMemo` recompute every render, which re-registers the adapter and
// loops forever (registerAdapter -> setState -> re-render -> recompute).
const brandContextValue = vi.hoisted(() => ({
  brands: [{ id: 'brand-2', label: 'Moonrise', organization: { id: 'org-1' } }],
  organizationId: 'org-1',
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandContextValue,
}));

const analyticsContextValue = vi.hoisted(() => ({
  dateRange: {
    endDate: new Date('2024-06-30T00:00:00.000Z'),
    startDate: new Date('2024-06-01T00:00:00.000Z'),
  },
  filters: {},
}));

vi.mock('@contexts/analytics/analytics-context', () => ({
  AnalyticsProvider: ({ children }: { children: ReactNode }) => children,
  useAnalyticsContext: () => analyticsContextValue,
}));

const orgUrlValue = vi.hoisted(() => ({ brandSlug: '', orgSlug: 'acme' }));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => orgUrlValue,
}));

const authedServiceStub = vi.hoisted(() => vi.fn());

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => authedServiceStub,
}));

const exportModalValue = vi.hoisted(() => ({ openExport: vi.fn() }));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useExportModal: () => exportModalValue,
}));

const agentStore = vi.hoisted(() => ({
  pageContext: undefined as
    | { analyticsQuery?: unknown; route?: string; suggestedActions?: unknown[] }
    | undefined,
  setPageContext: vi.fn(),
}));

vi.mock('@genfeedai/agent', () => ({
  useAgentChatStore: Object.assign(
    (selector: (state: typeof agentStore) => unknown) => selector(agentStore),
    { getState: () => agentStore },
  ),
}));

import {
  AnalyticsWorkspaceSurfaceAdapterProvider,
  useActiveAnalyticsWorkspaceSurfaceAdapter,
} from '@/features/analytics/work-surface/analytics-workspace-surface-adapter-context';

import AnalyticsWorkSurfaceAdapter from './analytics-work-surface-adapter';

function InspectorHarness() {
  const adapter = useActiveAnalyticsWorkspaceSurfaceAdapter();
  return (
    <>
      <span data-testid="workspace-brand">
        {adapter?.brandId ?? 'organization-wide'}
      </span>
      {adapter?.inspectorContent}
    </>
  );
}

function renderAdapter() {
  return (
    <AnalyticsWorkspaceSurfaceAdapterProvider>
      <AnalyticsWorkSurfaceAdapter>
        <InspectorHarness />
      </AnalyticsWorkSurfaceAdapter>
    </AnalyticsWorkspaceSurfaceAdapterProvider>
  );
}

describe('AnalyticsWorkSurfaceAdapter', () => {
  beforeEach(() => {
    navigation.pathname = '/acme/~/analytics/brands/brand-2';
    brandContextValue.brands = [
      { id: 'brand-2', label: 'Moonrise', organization: { id: 'org-1' } },
    ];
    brandContextValue.organizationId = 'org-1';
    orgUrlValue.brandSlug = '';
  });
  it('shows the real brand name instead of the "selected brand" placeholder', () => {
    navigation.pathname = '/acme/~/analytics/brands/brand-2';

    render(
      <AnalyticsWorkspaceSurfaceAdapterProvider>
        <AnalyticsWorkSurfaceAdapter>
          <InspectorHarness />
        </AnalyticsWorkSurfaceAdapter>
      </AnalyticsWorkspaceSurfaceAdapterProvider>,
    );

    expect(screen.getByText('acme / Moonrise')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-brand')).toHaveTextContent('brand-2');
    expect(screen.queryByText(/selected brand/)).not.toBeInTheDocument();
  });

  it('uses organization-wide scope when the route brand is unknown', () => {
    navigation.pathname = '/acme/~/analytics/brands/brand-unresolved';

    render(
      <AnalyticsWorkspaceSurfaceAdapterProvider>
        <AnalyticsWorkSurfaceAdapter>
          <InspectorHarness />
        </AnalyticsWorkSurfaceAdapter>
      </AnalyticsWorkspaceSurfaceAdapterProvider>,
    );

    expect(screen.getByText('acme / all brands')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-brand')).toHaveTextContent(
      'organization-wide',
    );
  });

  it('rejects a matching brand ID from another organization even inside a brand shell', () => {
    brandContextValue.brands = [
      {
        id: 'brand-2',
        label: 'Other organization',
        organization: { id: 'org-2' },
      },
    ];
    navigation.pathname = '/acme/moonrise/analytics/brands/brand-2';
    orgUrlValue.brandSlug = 'moonrise';

    render(renderAdapter());

    expect(screen.getByTestId('workspace-brand')).toHaveTextContent(
      'organization-wide',
    );
    expect(screen.getByText('acme / all brands')).toBeInTheDocument();
    expect(screen.queryByText(/Other organization/)).not.toBeInTheDocument();
  });

  it('waits for authorized brands to load before exposing a route binding', () => {
    brandContextValue.brands = [];
    const view = render(renderAdapter());

    expect(screen.getByTestId('workspace-brand')).toHaveTextContent(
      'organization-wide',
    );
    expect(screen.getByText('acme / all brands')).toBeInTheDocument();

    brandContextValue.brands = [
      { id: 'brand-2', label: 'Moonrise', organization: { id: 'org-1' } },
    ];
    view.rerender(renderAdapter());

    expect(screen.getByTestId('workspace-brand')).toHaveTextContent('brand-2');
    expect(screen.getByText('acme / Moonrise')).toBeInTheDocument();
  });

  it('drops a stale route binding when the brand is removed', () => {
    const view = render(renderAdapter());
    expect(screen.getByTestId('workspace-brand')).toHaveTextContent('brand-2');

    brandContextValue.brands = [];
    view.rerender(renderAdapter());

    expect(screen.getByTestId('workspace-brand')).toHaveTextContent(
      'organization-wide',
    );
    expect(screen.getByText('acme / all brands')).toBeInTheDocument();
  });

  it('drops the old route binding when the organization changes', () => {
    const view = render(renderAdapter());
    expect(screen.getByTestId('workspace-brand')).toHaveTextContent('brand-2');

    brandContextValue.organizationId = 'org-2';
    view.rerender(renderAdapter());

    expect(screen.getByTestId('workspace-brand')).toHaveTextContent(
      'organization-wide',
    );
    expect(screen.getByText('acme / all brands')).toBeInTheDocument();
  });

  it('preserves the authorized route binding on platform analytics', () => {
    navigation.pathname =
      '/acme/~/analytics/brands/brand-2/platforms/instagram';
    render(renderAdapter());

    expect(screen.getByTestId('workspace-brand')).toHaveTextContent('brand-2');
    expect(screen.getByText('acme / Moonrise')).toBeInTheDocument();
  });

  it('shows "all brands" on routes that name no brand', () => {
    navigation.pathname = '/acme/~/analytics/overview';

    render(
      <AnalyticsWorkspaceSurfaceAdapterProvider>
        <AnalyticsWorkSurfaceAdapter>
          <InspectorHarness />
        </AnalyticsWorkSurfaceAdapter>
      </AnalyticsWorkspaceSurfaceAdapterProvider>,
    );

    expect(screen.getByText('acme / all brands')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-brand')).toHaveTextContent(
      'organization-wide',
    );
  });
});
