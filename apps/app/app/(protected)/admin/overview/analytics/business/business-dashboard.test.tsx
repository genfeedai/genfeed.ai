import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue('test-token') }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () =>
    vi.fn().mockResolvedValue({
      getBusinessAnalytics: vi.fn().mockResolvedValue(null),
    }),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: () => ({
    data: null,
    error: null,
    isLoading: true,
    isRefreshing: false,
    mutate: vi.fn(),
    refresh: vi.fn(),
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
  it('renders loading state when data is null and loading', async () => {
    const { default: BusinessDashboard } = await import('./business-dashboard');
    render(<BusinessDashboard />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });
});
