// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceOverviewContent from './content';

const mocks = vi.hoisted(() => ({
  hydrateLayout: vi.fn(),
  resetLayout: vi.fn(),
  useDashboardLayout: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock('@hooks/data/analytics/use-analytics/use-analytics', () => ({
  useAnalytics: () => ({
    analytics: { totalPosts: 12 },
  }),
}));

vi.mock(
  '@hooks/data/content/use-dashboard-layout/use-dashboard-layout',
  () => ({
    useDashboardLayout: (...args: unknown[]) =>
      mocks.useDashboardLayout(...args),
  }),
);

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

vi.mock('@ui/loading/fallback/LazyLoadingFallback', () => ({
  default: () => <div data-testid="dashboard-loading-fallback" />,
}));

vi.mock('../workspace-page', () => ({
  default: () => <div data-testid="workspace-page-fallback" />,
}));

describe('WorkspaceOverviewContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hydrateLayout.mockReturnValue([{ id: 'block-1' }, { id: 'block-2' }]);
  });

  it('renders the loading fallback while the persisted layout query is in flight', () => {
    mocks.useDashboardLayout.mockReturnValue({
      isLoading: true,
      layout: undefined,
      resetLayout: mocks.resetLayout,
    });

    render(<WorkspaceOverviewContent />);

    expect(
      screen.getByTestId('dashboard-loading-fallback'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('workspace-page-fallback'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('dashboard-open-ui-renderer'),
    ).not.toBeInTheDocument();
  });

  it('falls back to the default workspace page when no layout is persisted', () => {
    mocks.useDashboardLayout.mockReturnValue({
      isLoading: false,
      layout: undefined,
      resetLayout: mocks.resetLayout,
    });

    render(<WorkspaceOverviewContent />);

    expect(screen.getByTestId('workspace-page-fallback')).toBeInTheDocument();
    expect(mocks.hydrateLayout).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId('dashboard-open-ui-renderer'),
    ).not.toBeInTheDocument();
  });

  it('hydrates and renders the persisted layout, and resets it on demand', () => {
    const document = { blocks: [], version: 'genfeed.dashboard.openui.v1' };
    mocks.useDashboardLayout.mockReturnValue({
      isLoading: false,
      layout: { document, id: 'layout-1' },
      resetLayout: mocks.resetLayout,
    });

    render(<WorkspaceOverviewContent />);

    expect(
      screen.queryByTestId('workspace-page-fallback'),
    ).not.toBeInTheDocument();
    expect(mocks.hydrateLayout).toHaveBeenCalledWith(
      document,
      expect.objectContaining({ analytics: { totalPosts: 12 } }),
    );
    expect(screen.getByTestId('dashboard-open-ui-renderer')).toHaveTextContent(
      'Rendered blocks: 2',
    );

    fireEvent.click(screen.getByRole('button', { name: /reset to default/i }));
    expect(mocks.resetLayout).toHaveBeenCalledTimes(1);
  });
});
