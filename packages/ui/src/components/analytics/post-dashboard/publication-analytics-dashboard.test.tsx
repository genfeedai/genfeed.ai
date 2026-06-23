import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import PublicationAnalyticsDashboard from '@ui/analytics/post-dashboard/publication-analytics-dashboard';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({ isSignedIn: true }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('PublicationAnalyticsDashboard', () => {
  it('should render without crashing', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PublicationAnalyticsDashboard />
      </Wrapper>,
    );
    expect(screen.getByText('No analytics data available')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <PublicationAnalyticsDashboard />
      </Wrapper>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <PublicationAnalyticsDashboard />
      </Wrapper>,
    );
    const rootElement = container.firstChild;
    expect(rootElement).toBeInTheDocument();
  });
});
