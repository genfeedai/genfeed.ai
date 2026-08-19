// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublicLayout from './layout';
import '@testing-library/jest-dom/vitest';

vi.mock('@/components/analytics/AnalyticsPublicRouteSync', () => ({
  default: () => <div data-testid="analytics-public-route-sync" />,
}));

describe('PublicLayout', () => {
  it('synchronizes anonymous analytics around public routes', () => {
    render(
      <PublicLayout>
        <div data-testid="public-content" />
      </PublicLayout>,
    );

    expect(
      screen.getByTestId('analytics-public-route-sync'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('public-content')).toBeInTheDocument();
  });
});
