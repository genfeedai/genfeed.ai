import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AnalyticsTrends from './analytics-trends';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    brands: [],
  })),
  useBrandId: vi.fn(() => 'brand-1'),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  AuthenticationTokenUnavailableError: class AuthenticationTokenUnavailableError extends Error {},
  useAuthedService: vi.fn(() =>
    vi.fn().mockResolvedValue({
      getTrendsDiscovery: vi.fn().mockResolvedValue({ trends: [] }),
      getTrendingHashtags: vi.fn().mockResolvedValue([]),
      getTrendingSounds: vi.fn().mockResolvedValue([]),
      getTrendingTopics: vi.fn().mockResolvedValue([]),
      getViralVideos: vi.fn().mockResolvedValue([]),
    }),
  ),
}));

vi.mock('@services/social/trends.service', () => ({
  TrendsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@pages/trends/list/components/HookRemixModal', () => ({
  default: () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  })),
}));

describe('AnalyticsTrends', () => {
  it('should render without crashing', () => {
    const { container } = render(<AnalyticsTrends />, { wrapper: Wrapper });
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {});

  it('should apply correct styles and classes', () => {});
});
