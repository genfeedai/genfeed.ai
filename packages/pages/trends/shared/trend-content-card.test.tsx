import '@testing-library/jest-dom/vitest';
import type { TrendContentItem } from '@props/trends/trends-page.props';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => 'brand-1',
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ createResearchBriefRun: vi.fn() }),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

import TrendContentCard from './trend-content-card';

describe('TrendContentCard', () => {
  const item: TrendContentItem = {
    contentRank: 1,
    contentType: 'tweet',
    id: 'content-1',
    matchedTrends: ['Agent workflows'],
    platform: 'twitter',
    requiresAuth: false,
    sourcePreviewState: 'live',
    sourceReferenceId: 'reference-1',
    sourceUrl: 'https://x.com/source/status/1',
    text: 'A source post about agent workflows.',
    trendId: 'trend-1',
    trendMentions: 120,
    trendTopic: 'Agent workflows',
    trendViralityScore: 87,
  };

  beforeEach(() => vi.clearAllMocks());

  it('routes an imported trend reference to the shared variation flow', async () => {
    const user = userEvent.setup();
    render(<TrendContentCard item={item} />);

    await user.click(screen.getByRole('button', { name: 'Remix' }));

    expect(mocks.push).toHaveBeenCalledWith(
      '/publish/remix?platform=twitter&sourceReferenceId=reference-1&trendId=trend-1',
    );
  });
});
