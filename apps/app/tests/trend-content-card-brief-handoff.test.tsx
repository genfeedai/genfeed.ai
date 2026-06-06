import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TrendContentCard from '@pages/trends/shared/trend-content-card';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createResearchBriefRun = vi.fn();
const notifyError = vi.fn();
const notifySuccess = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => 'brand-1',
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createResearchBriefRun,
  }),
}));

vi.mock('@services/content/content-runs.service', () => ({
  ContentRunsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({
      copyToClipboard: vi.fn(),
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: notifyError,
      success: notifySuccess,
    }),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('TrendContentCard brief handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createResearchBriefRun.mockResolvedValue({ _id: 'run-1' });
  });

  it('saves a trend source as a structured Content Run brief', async () => {
    render(
      <TrendContentCard
        item={{
          authorHandle: 'builderx',
          contentRank: 1,
          contentType: 'tweet',
          id: 'source-1',
          matchedTrends: ['#AIAgents'],
          metrics: { likes: 120 },
          platform: 'twitter',
          requiresAuth: false,
          sourcePreviewState: 'live',
          sourceReferenceId: 'source-ref-1',
          sourceUrl: 'https://x.com/builderx/status/1',
          text: 'AI agents are getting embedded directly into content workflows.',
          title: 'AI agents are getting embedded directly into workflows',
          trendId: 'trend-1',
          trendMentions: 20000,
          trendTopic: '#AIAgents',
          trendViralityScore: 90,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Brief' }));

    await waitFor(() => {
      expect(createResearchBriefRun).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          angle: 'AI agents are getting embedded directly into workflows',
          evidence: expect.arrayContaining([
            'AI agents are getting embedded directly into workflows',
            'AI agents are getting embedded directly into content workflows.',
            'Creator: @builderx',
            'Source: https://x.com/builderx/status/1',
          ]),
          matchedTrends: ['#AIAgents'],
          platform: 'twitter',
          sourceContentId: 'source-1',
          sourceReferenceId: 'source-ref-1',
          sourceUrl: 'https://x.com/builderx/status/1',
          trendId: 'trend-1',
          trendTopic: '#AIAgents',
        }),
      );
    });
    expect(notifySuccess).toHaveBeenCalledWith('Brief saved to Content Runs');
    expect(notifyError).not.toHaveBeenCalled();
  });
});
