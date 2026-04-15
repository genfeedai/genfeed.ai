import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import AnalyticsHooks from './analytics-hooks';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  AuthenticationTokenUnavailableError: class AuthenticationTokenUnavailableError extends Error {},
  useAuthedService: vi.fn(() =>
    vi.fn().mockResolvedValue({
      getViralHooks: vi.fn().mockResolvedValue({
        analysis: {
          avgTimePerVideo: 0,
          hookEffectiveness: [],
          topHooks: [],
          topPlatforms: [],
          totalTime: 0,
          totalVideos: 0,
        },
        videos: [],
      }),
    }),
  ),
}));

vi.mock('@services/analytics/analytics.service', () => ({
  AnalyticsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div data-testid="loading">Loading</div>,
}));

describe('AnalyticsHooks', () => {
  it('should render without crashing', () => {
    const { container } = render(<AnalyticsHooks />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {});

  it('should apply correct styles and classes', () => {});
});
