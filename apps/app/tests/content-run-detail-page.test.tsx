import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContentRunDetailPage from '@pages/content-runs/detail/content-run-detail';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findOne = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    findOne,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/main${path}`,
  }),
}));

vi.mock('@services/content/content-runs.service', () => ({
  ContentRunsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

describe('ContentRunDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOne.mockResolvedValue({
      _id: 'run-1',
      analyticsSummary: {
        engagementRate: 4.25,
        engagements: 425,
        impressions: 10_000,
        metadata: {},
        summary: 'Variant A is outperforming replies.',
        topSignals: ['Hook retained attention'],
        winningVariantId: 'variant-a',
      },
      brief: {
        angle: 'AI workflow proof',
        audience: 'Founders',
        channelFit: 'Strong fit for X',
        confidence: 0.82,
        evidence: ['Source: https://example.com/post/1'],
        hypothesis: 'Turn the trend into a proof thread.',
      },
      createdAt: '2026-05-01T09:00:00.000Z',
      creditsUsed: 3,
      publish: {
        metadata: {},
        platform: 'twitter',
        postIds: ['post-1'],
        publishedAt: '2026-05-01T11:00:00.000Z',
        variantId: 'variant-a',
      },
      recommendations: [
        {
          action: 'Promote the winning hook',
          confidence: 0.9,
          metadata: {},
          rationale: 'Engagement is above baseline.',
          type: 'repeat',
        },
      ],
      skillSlug: 'trend-remix',
      status: 'completed',
      variants: [
        {
          angle: 'Founder proof thread',
          content: 'Here is the working loop.',
          format: 'post-thread',
          id: 'variant-a',
          metadata: {},
          platform: 'twitter',
          status: 'ready',
          type: 'text',
        },
      ],
    });
  });

  it('renders the full content run lifecycle and subview navigation', async () => {
    render(<ContentRunDetailPage runId="run-1" />);

    await waitFor(() => {
      expect(findOne).toHaveBeenCalledWith('run-1');
    });

    expect(
      screen.getByRole('heading', { name: 'AI workflow proof' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Source Brief')).toBeInTheDocument();
    expect(screen.getByText('Remix Variants')).toBeInTheDocument();
    expect(screen.getByText('Publish Events')).toBeInTheDocument();
    expect(screen.getByText('Analytics Summary')).toBeInTheDocument();
    expect(screen.getByText('Recommended Next Actions')).toBeInTheDocument();
    expect(
      screen.getByText('Variant A is outperforming replies.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Remix/i })).toHaveAttribute(
      'href',
      '/acme/main/posts/remix',
    );
    expect(screen.getByRole('link', { name: /Publish/i })).toHaveAttribute(
      'href',
      '/acme/main/posts',
    );
    expect(screen.getByRole('link', { name: /Analytics/i })).toHaveAttribute(
      'href',
      '/acme/main/analytics/posts',
    );
  });
});
