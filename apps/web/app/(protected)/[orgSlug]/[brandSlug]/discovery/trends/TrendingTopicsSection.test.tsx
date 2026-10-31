import type { TrendItem } from '@props/trends/trends-page.props';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import TrendingTopicsSection from './TrendingTopicsSection';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/ui/context-sidebar-context', () => ({
  ContextSidebarPanel: ({
    children,
    selection,
  }: {
    children: ReactNode;
    selection: { kind: string; title: string } | null;
  }) =>
    selection ? (
      <aside data-kind={selection.kind} data-testid="context-sidebar">
        <h2>{selection.title}</h2>
        {children}
      </aside>
    ) : null,
}));

const trend = {
  createdAt: '2026-10-01T10:00:00.000Z',
  expiresAt: '2026-10-08T10:00:00.000Z',
  growthRate: 12,
  id: 'trend-1',
  isCurrent: true,
  mentions: 5400,
  metadata: { growthMeasured: true, sampleContent: 'Sample post body' },
  platform: 'tiktok',
  requiresAuth: false,
  topic: 'Cozy gaming',
  viralityScore: 72,
} as TrendItem;

function renderSection() {
  return render(
    <TrendingTopicsSection
      getRowLink={(item) => ({
        href: `/acme/moonrise/discovery/trends/detail/${item.id}`,
        label: `Open ${item.topic}`,
      })}
      isLoadingTrends={false}
      platformConfigLookup={{ tiktok: { label: 'TikTok' } }}
      trendingTopics={[trend]}
    />,
  );
}

describe('TrendingTopicsSection', () => {
  it('puts the topic first and links it to the trend page', () => {
    renderSection();

    const link = screen.getByRole('link', { name: 'Open Cozy gaming' });
    expect(link).toHaveAttribute(
      'href',
      '/acme/moonrise/discovery/trends/detail/trend-1',
    );
    expect(link.closest('td')).toBe(
      (link.closest('tr') as HTMLElement).querySelector('td'),
    );
  });

  it('opens the trend summary in the sidebar from the row, not the name link', () => {
    renderSection();

    const link = screen.getByRole('link', { name: 'Open Cozy gaming' });
    fireEvent.click(link);
    expect(screen.queryByTestId('context-sidebar')).not.toBeInTheDocument();

    fireEvent.click(within(link.closest('tr') as HTMLElement).getByText('72'));

    const sidebar = screen.getByTestId('context-sidebar');
    expect(sidebar).toHaveAttribute('data-kind', 'trend');
    expect(within(sidebar).getByText('Sample post body')).toBeVisible();
  });
});
