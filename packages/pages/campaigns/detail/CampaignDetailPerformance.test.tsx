import CampaignDetailPerformance from '@pages/campaigns/detail/CampaignDetailPerformance';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const mockUseCampaignPerformance = vi.fn();

vi.mock('@hooks/data/campaigns/use-campaign-performance', () => ({
  useCampaignPerformance: () => mockUseCampaignPerformance(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@ui/feedback/LoadingState', () => ({
  default: () => <div>loading</div>,
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children, label }: { children: ReactNode; label: string }) => (
    <section>
      <h2>{label}</h2>
      {children}
    </section>
  ),
}));

vi.mock('@ui/cards/metric-card/MetricCard', () => ({
  default: ({
    description,
    label,
    value,
  }: {
    description?: string;
    label: string;
    value: string;
  }) => (
    <article>
      <p>{label}</p>
      <p>{value}</p>
      <p>{description}</p>
    </article>
  ),
}));

vi.mock('@ui/cards/metric-card/MetricCardGrid', () => ({
  MetricCardGrid: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('CampaignDetailPerformance', () => {
  beforeEach(() => {
    mockUseCampaignPerformance.mockReturnValue({
      isLoading: false,
      performance: {
        byPlatform: [],
        organic: {
          clicks: { availablePostCount: 0, totalPostCount: 2, value: null },
          conversions: {
            availablePostCount: 0,
            totalPostCount: 2,
            value: null,
          },
          engagements: { availablePostCount: 1, totalPostCount: 2, value: 7 },
          views: { availablePostCount: 1, totalPostCount: 2, value: 50 },
        },
        postCounts: { published: 1, draft: 1 },
      },
    });
  });

  it('renders measured totals and keeps missing metrics as a dash', () => {
    render(<CampaignDetailPerformance campaignId="cmp-1" />);

    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('published')).toBeInTheDocument();
  });
});
