import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({
    dateRange: { endDate: null, startDate: null },
    isRefreshing: false,
    setDateRange: vi.fn(),
    toolbarNode: null,
    triggerRefresh: vi.fn(),
  }),
}));

vi.mock('@ui/error', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    label,
    right,
  }: {
    children: ReactNode;
    label: string;
    right: ReactNode;
  }) => (
    <section aria-label={label}>
      <div data-testid="toolbar">{right}</div>
      {children}
    </section>
  ),
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: () => null,
}));

vi.mock('@ui/primitives/date-range-picker', () => ({
  default: () => null,
}));

// The export button reads its handler from the adapter's context, so it has
// to render inside the adapter in both analytics layouts.
vi.mock('./analytics-work-surface-adapter', () => ({
  AnalyticsScopedExportButton: () => <span>Scoped export button</span>,
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="analytics-adapter">{children}</div>
  ),
}));

import OrgAnalyticsLayout from '../../../~/analytics/layout';
import AnalyticsLayout from '../layout';

describe('analytics layouts', () => {
  it.each([
    ['brand', AnalyticsLayout, 'Analytics'],
    ['organization', OrgAnalyticsLayout, 'Organization Analytics'],
  ])(
    '%s layout renders the scoped export in its toolbar inside the adapter',
    (_scope, Layout, title) => {
      render(
        <Layout>
          <p>Page</p>
        </Layout>,
      );

      const adapter = screen.getByTestId('analytics-adapter');
      const section = within(adapter).getByRole('region', { name: title });
      expect(
        within(within(section).getByTestId('toolbar')).getByText(
          'Scoped export button',
        ),
      ).toBeInTheDocument();
    },
  );
});
