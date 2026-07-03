// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ButtonVariant } from '@genfeedai/enums';
import type { TrendItem } from '@genfeedai/props/trends/trends-page.props';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OverviewTrendsPanel } from './OverviewTrendsPanel';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children?: ReactNode;
    variant?: ButtonVariant;
  }) => {
    void asChild;
    return <>{children}</>;
  },
}));

vi.mock('@ui/overview/WorkspaceSurface', () => ({
  WorkspaceSurface: ({
    actions,
    children,
    eyebrow,
    title,
    tone,
  }: {
    actions?: ReactNode;
    children: ReactNode;
    eyebrow?: ReactNode;
    title?: ReactNode;
    tone?: string;
  }) => (
    <section data-testid="workspace-surface" data-tone={tone}>
      {eyebrow ? <p>{eyebrow}</p> : null}
      {title ? <h2>{title}</h2> : null}
      {actions ? <div>{actions}</div> : null}
      {children}
    </section>
  ),
}));

function makeTrend(overrides: Partial<TrendItem> = {}): TrendItem {
  return {
    createdAt: '2026-06-01T00:00:00.000Z',
    expiresAt: '2026-06-08T00:00:00.000Z',
    growthRate: 1.2,
    id: 'trend-1',
    isCurrent: true,
    mentions: 500,
    platform: 'instagram',
    requiresAuth: false,
    topic: 'AI video trends',
    viralityScore: 850,
    ...overrides,
  };
}

const TRENDS: TrendItem[] = [
  makeTrend({
    id: 'trend-1',
    platform: 'instagram',
    topic: 'Reels growth',
    viralityScore: 950,
  }),
  makeTrend({
    id: 'trend-2',
    platform: 'tiktok',
    topic: 'Short form comedy',
    viralityScore: 800,
  }),
  makeTrend({
    id: 'trend-3',
    platform: 'youtube',
    topic: 'AI tutorials',
    viralityScore: 700,
  }),
  makeTrend({
    id: 'trend-4',
    platform: 'twitter',
    topic: 'Tech layoffs',
    viralityScore: 600,
  }),
  makeTrend({
    id: 'trend-5',
    platform: 'linkedin',
    topic: 'B2B content tips',
    viralityScore: 500,
  }),
  makeTrend({
    id: 'trend-6',
    platform: 'reddit',
    topic: 'Low-score outlier',
    viralityScore: 100,
  }),
];

describe('OverviewTrendsPanel', () => {
  it('renders the eyebrow and title via WorkspaceSurface', () => {
    render(
      <OverviewTrendsPanel
        isLoading={false}
        trends={TRENDS}
        viewAllHref="/research/discovery"
      />,
    );

    expect(screen.getByText('Social Trends')).toBeInTheDocument();
    expect(screen.getByText('Research Trends')).toBeInTheDocument();
  });

  it('defaults to the canonical dashboard card tone', () => {
    render(
      <OverviewTrendsPanel
        isLoading={false}
        trends={TRENDS}
        viewAllHref="/research/discovery"
      />,
    );

    expect(screen.getByTestId('workspace-surface')).toHaveAttribute(
      'data-tone',
      'card',
    );
  });

  it('forwards an explicit tone override to WorkspaceSurface', () => {
    render(
      <OverviewTrendsPanel
        isLoading={false}
        tone="default"
        trends={TRENDS}
        viewAllHref="/research/discovery"
      />,
    );

    expect(screen.getByTestId('workspace-surface')).toHaveAttribute(
      'data-tone',
      'default',
    );
  });

  it('renders the "View All" link with the correct href', () => {
    render(
      <OverviewTrendsPanel
        isLoading={false}
        trends={TRENDS}
        viewAllHref="/research/discovery"
      />,
    );

    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute(
      'href',
      '/research/discovery',
    );
  });

  it('renders at most 5 trends sorted by virality score descending', () => {
    render(
      <OverviewTrendsPanel
        isLoading={false}
        trends={TRENDS}
        viewAllHref="/research/discovery"
      />,
    );

    const list = screen.getByTestId('overview-trends-list');
    const rows = list.querySelectorAll('[class*="gen-shell-surface"]');
    expect(rows).toHaveLength(5);

    // First item should be highest virality
    expect(rows[0]).toHaveTextContent('Reels growth');
    expect(rows[4]).toHaveTextContent('B2B content tips');

    // The low-score trend-6 should NOT appear
    expect(screen.queryByText('Low-score outlier')).not.toBeInTheDocument();
  });

  it('renders platform badges and virality scores', () => {
    render(
      <OverviewTrendsPanel
        isLoading={false}
        trends={TRENDS}
        viewAllHref="/research/discovery"
      />,
    );

    expect(screen.getAllByText('instagram')[0]).toBeInTheDocument();
    expect(screen.getByText('950')).toBeInTheDocument();
  });

  it('renders the loading skeleton when isLoading is true', () => {
    render(
      <OverviewTrendsPanel
        isLoading={true}
        trends={[]}
        viewAllHref="/research/discovery"
      />,
    );

    expect(screen.getByTestId('overview-trends-loading')).toBeInTheDocument();
    expect(
      screen.queryByTestId('overview-trends-list'),
    ).not.toBeInTheDocument();
  });

  it('renders the empty state when trends is empty and not loading', () => {
    render(
      <OverviewTrendsPanel
        isLoading={false}
        trends={[]}
        viewAllHref="/research/discovery"
      />,
    );

    expect(screen.getByTestId('overview-trends-empty')).toHaveTextContent(
      'No trends yet.',
    );
  });
});
