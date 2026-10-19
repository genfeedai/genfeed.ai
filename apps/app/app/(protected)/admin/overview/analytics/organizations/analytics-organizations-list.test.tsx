import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsOrganizationsList from './analytics-organizations-list';

const mocks = vi.hoisted(() => ({
  getOrganizationsWithStats: vi.fn(),
  setToolbarNode: vi.fn(),
}));

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: vi.fn(() => ({
    dateRange: {
      endDate: new Date('2026-04-14T00:00:00.000Z'),
      startDate: new Date('2026-04-08T00:00:00.000Z'),
    },
    refreshTrigger: 0,
    setToolbarNode: mocks.setToolbarNode,
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => async () => ({
    getOrganizationsWithStats: mocks.getOrganizationsWithStats,
  })),
}));

vi.mock('@services/analytics/analytics.service', () => ({
  AnalyticsService: {
    getInstance: vi.fn(),
  },
}));

describe('AnalyticsOrganizationsList shell-first loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the table skeleton and hands the sort control to the subbar while loading', () => {
    mocks.getOrganizationsWithStats.mockReturnValueOnce(
      new Promise(() => undefined),
    );

    render(<AnalyticsOrganizationsList />);

    expect(
      screen.queryByRole('heading', { name: /All Organizations/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('skeleton-table')).toBeVisible();
    expect(mocks.setToolbarNode).toHaveBeenCalledWith(expect.anything());
  });

  it('renders the organizations table once loading resolves', async () => {
    mocks.getOrganizationsWithStats.mockResolvedValueOnce({
      data: [],
      pagination: {
        page: 1,
        total: 0,
        totalPages: 0,
      },
    });

    render(<AnalyticsOrganizationsList />);

    await waitFor(() => {
      expect(screen.queryByTestId('skeleton-table')).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole('heading', { name: /All Organizations/ }),
    ).not.toBeInTheDocument();
  });
});
