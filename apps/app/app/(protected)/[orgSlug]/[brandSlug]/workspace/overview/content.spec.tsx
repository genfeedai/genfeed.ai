// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceOverviewContent from './content';

const mocks = vi.hoisted(() => ({
  hydrateLayout: vi.fn(),
  resetLayout: vi.fn(),
  useDashboardLayout: vi.fn(),
  useWorkspaceDashboardData: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock(
  '@hooks/data/content/use-dashboard-layout/use-dashboard-layout',
  () => ({
    useDashboardLayout: (...args: unknown[]) =>
      mocks.useDashboardLayout(...args),
  }),
);

vi.mock('./use-workspace-dashboard-data', () => ({
  useWorkspaceDashboardData: (...args: unknown[]) =>
    mocks.useWorkspaceDashboardData(...args),
}));

vi.mock('@genfeedai/agent/dashboard', () => ({
  hydrateLayout: (...args: unknown[]) => mocks.hydrateLayout(...args),
}));

vi.mock('@genfeedai/agent/components', () => ({
  DashboardOpenUIRenderer: ({ blocks }: { blocks: Array<{ id: string }> }) => (
    <div data-testid="dashboard-open-ui-renderer">
      Rendered blocks: {blocks.length}
    </div>
  ),
}));

vi.mock('@app/(protected)/home/content', () => ({
  default: () => <div data-testid="operational-home-fallback" />,
}));

describe('WorkspaceOverviewContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hydrateLayout.mockReturnValue([{ id: 'block-1' }, { id: 'block-2' }]);
    mocks.useWorkspaceDashboardData.mockReturnValue({
      bundle: {
        analytics: { totalPosts: 12 },
        platformComparisonData: [{ platform: 'instagram', views: 20 }],
        timeSeriesData: [{ date: '2026-08-08', views: 20 }],
        topPosts: [{ id: 'post-1', views: 20 }],
      },
      isLoading: false,
    });
  });

  it('renders an in-region loading placeholder while the persisted layout query is in flight', () => {
    mocks.useDashboardLayout.mockReturnValue({
      isLoading: true,
      layout: undefined,
      resetLayout: mocks.resetLayout,
    });

    render(<WorkspaceOverviewContent />);

    expect(
      screen.getByTestId('workspace-overview-loading'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('operational-home-fallback'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('dashboard-open-ui-renderer'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /reset to default/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the reset toolbar mounted while the persisted layout bundle is still loading', () => {
    mocks.useDashboardLayout.mockReturnValue({
      isLoading: false,
      layout: {
        brandId: 'brand-1',
        document: { blocks: [], version: 'genfeed.dashboard.openui.v1' },
        id: 'layout-1',
      },
      resetLayout: mocks.resetLayout,
    });
    mocks.useWorkspaceDashboardData.mockReturnValue({
      bundle: undefined,
      isLoading: true,
    });

    render(<WorkspaceOverviewContent />);

    expect(
      screen.getByRole('button', { name: /reset to default/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('workspace-dashboard-loading'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('dashboard-open-ui-renderer'),
    ).not.toBeInTheDocument();
    expect(mocks.hydrateLayout).not.toHaveBeenCalled();
  });

  it('renders the operational overview when no custom layout is persisted', () => {
    mocks.useDashboardLayout.mockReturnValue({
      isLoading: false,
      layout: undefined,
      resetLayout: mocks.resetLayout,
    });

    render(<WorkspaceOverviewContent />);

    expect(screen.getByTestId('operational-home-fallback')).toBeInTheDocument();
    expect(mocks.hydrateLayout).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId('dashboard-open-ui-renderer'),
    ).not.toBeInTheDocument();
  });

  it('hydrates and renders the persisted layout, and resets it on demand', () => {
    const document = { blocks: [], version: 'genfeed.dashboard.openui.v1' };
    mocks.useDashboardLayout.mockReturnValue({
      isLoading: false,
      layout: { brandId: 'brand-1', document, id: 'layout-1' },
      resetLayout: mocks.resetLayout,
    });

    render(<WorkspaceOverviewContent />);

    expect(
      screen.queryByTestId('operational-home-fallback'),
    ).not.toBeInTheDocument();
    expect(mocks.hydrateLayout).toHaveBeenCalledWith(
      document,
      expect.objectContaining({
        analytics: { totalPosts: 12 },
        timeSeriesData: [{ date: '2026-08-08', views: 20 }],
        topPosts: [{ id: 'post-1', views: 20 }],
      }),
    );
    expect(screen.getByTestId('dashboard-open-ui-renderer')).toHaveTextContent(
      'Rendered blocks: 2',
    );

    fireEvent.click(screen.getByRole('button', { name: /reset to default/i }));
    expect(mocks.resetLayout).toHaveBeenCalledTimes(1);
  });

  it('renders the operational default without deleting an invalid persisted layout', () => {
    mocks.hydrateLayout.mockImplementation(() => {
      throw new Error('invalid persisted OpenUI document');
    });
    mocks.useDashboardLayout.mockReturnValue({
      isLoading: false,
      layout: {
        brandId: 'brand-1',
        document: { blocks: [], version: 'genfeed.dashboard.openui.v1' },
        id: 'layout-1',
      },
      resetLayout: mocks.resetLayout,
    });

    render(<WorkspaceOverviewContent />);

    expect(screen.getByTestId('operational-home-fallback')).toBeInTheDocument();
    expect(
      screen.queryByTestId('dashboard-open-ui-renderer'),
    ).not.toBeInTheDocument();
    expect(mocks.resetLayout).not.toHaveBeenCalled();
  });
});
