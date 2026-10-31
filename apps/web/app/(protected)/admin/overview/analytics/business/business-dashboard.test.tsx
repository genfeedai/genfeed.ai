import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue('test-token') }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () =>
    vi.fn().mockResolvedValue({
      getBusinessAnalytics: vi.fn().mockResolvedValue(null),
    }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: null,
    error: null,
    isFetching: false,
    isLoading: true,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
  }),
}));

vi.mock('@services/analytics/analytics.service', () => ({
  AnalyticsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div data-testid="loading">Loading</div>,
}));

vi.mock('@ui/feedback/alert/Alert', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert">{children}</div>
  ),
}));

vi.mock('@ui/kpi/kpi-section/KPISection', () => ({
  default: ({ title }: { title: string }) => (
    <div data-testid="kpi-section">{title}</div>
  ),
}));

describe('BusinessDashboard', () => {
  it('renders the KPI section chrome immediately alongside the lower-section loader', async () => {
    const { default: BusinessDashboard } = await import('./business-dashboard');
    render(<BusinessDashboard />);

    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('kpi-section')).toHaveLength(3);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Credits')).toBeInTheDocument();
    expect(screen.getByText('Ingredients Generated')).toBeInTheDocument();
    expect(screen.queryByText('Top Organizations')).not.toBeInTheDocument();
  });
});
