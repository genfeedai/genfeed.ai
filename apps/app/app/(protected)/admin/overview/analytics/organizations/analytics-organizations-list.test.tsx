import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsOrganizationsList from './analytics-organizations-list';

const mocks = vi.hoisted(() => ({
  getOrganizationsWithStats: vi.fn(),
}));

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: vi.fn(() => ({
    dateRange: {
      endDate: new Date('2026-04-14T00:00:00.000Z'),
      startDate: new Date('2026-04-08T00:00:00.000Z'),
    },
    refreshTrigger: 0,
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

  it('renders the heading and sort control immediately while organizations are loading', () => {
    mocks.getOrganizationsWithStats.mockReturnValueOnce(
      new Promise(() => undefined),
    );

    render(<AnalyticsOrganizationsList />);

    expect(
      screen.getByRole('heading', { name: /All Organizations/ }),
    ).toBeVisible();
    expect(screen.getByTestId('skeleton-table')).toBeVisible();
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
      screen.getByRole('heading', { name: /All Organizations/ }),
    ).toBeVisible();
  });
});
