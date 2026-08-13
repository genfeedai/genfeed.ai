import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TrendContentCard from '@pages/trends/shared/trend-content-card';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createResearchBriefRun = vi.fn();
const notifyError = vi.fn();
const notifySuccess = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: { slug: 'brand-1' },
  }),
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
  useParams: () => ({ brandSlug: 'brand-1', orgSlug: 'org-1' }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      'actions.copyPrompt': 'Copy prompt',
      'actions.openSource': 'Open source',
      'actions.remix': 'Remix',
      'actions.sendToAgent': 'Send to agent',
    };
    return messages[key] ?? key;
  },
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

    // Radix opens the dropdown on pointerdown, which jsdom does not synthesize
    // from a click — fire both, as the other overflow-menu specs do.
    const trigger = screen.getByRole('button', { name: 'More trend actions' });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Save brief' }),
    );

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
