import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@components/loading/fallback/LazyLoadingFallback', () => ({
  default: () => <div data-testid="loading-fallback">Loading...</div>,
}));

vi.mock('@pages/analytics/business/business-dashboard', () => ({
  default: () => <div data-testid="business-dashboard">Business Dashboard</div>,
}));

vi.mock('@helpers/media/metadata/page-metadata.helper', () => ({
  createPageMetadata: () => () => ({ title: 'Business Analytics' }),
}));

describe('BusinessAnalyticsPage', () => {
  it('renders the business dashboard', async () => {
    const { default: BusinessAnalyticsPage } = await import('./page');
    render(<BusinessAnalyticsPage />);
    expect(screen.getByTestId('business-dashboard')).toBeInTheDocument();
  });
});
