import '@testing-library/jest-dom/vitest';
import type { TrendContentItem } from '@props/trends/trends-page.props';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

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

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => ({ brandSlug: 'brand-1', orgSlug: 'org-1' }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => 'brand-1',
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org-1/brand-1${path}` }),
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

  it('links an imported trend reference to the org- and brand-scoped variation flow', () => {
    render(<TrendContentCard item={item} />);

    expect(screen.getByRole('link', { name: 'Remix' })).toHaveAttribute(
      'href',
      '/org-1/brand-1/publish/remix?platform=twitter&sourceReferenceId=reference-1&trendId=trend-1',
    );
  });
});
