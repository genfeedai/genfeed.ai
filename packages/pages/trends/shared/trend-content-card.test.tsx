import '@testing-library/jest-dom/vitest';
import type { TrendContentItem } from '@props/trends/trends-page.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isRemixAvailable: true,
  openRemix: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      'actions.copyPrompt': 'Copy prompt',
      'actions.openSource': 'Open source',
      'actions.remix': 'Remix',
      'actions.remixUnavailable': 'Remix unavailable',
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
vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () =>
    mocks.isRemixAvailable ? { openRemix: mocks.openRemix } : null,
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

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRemixAvailable = true;
  });

  it('links an imported trend reference to the org- and brand-scoped variation flow', () => {
    render(<TrendContentCard item={item} />);

    expect(screen.getByRole('link', { name: 'Remix' })).toHaveAttribute(
      'href',
      '/org-1/brand-1/publishing/remix?platform=twitter&sourceReferenceId=reference-1&trendId=trend-1',
    );
  });

  it('opens the shared prefilled brief for eligible TikTok trend content', () => {
    render(
      <TrendContentCard
        item={{
          ...item,
          contentType: 'video',
          platform: 'tiktok',
          sourceReferenceId: 'tiktok-reference-1',
          trendId: 'tiktok-trend-1',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remix' }));

    expect(mocks.openRemix).toHaveBeenCalledWith({
      kind: 'trend_reference',
      sourceReferenceId: 'tiktok-reference-1',
      trendId: 'tiktok-trend-1',
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each(['instagram', 'youtube'] as const)(
    'opens the shared prefilled brief for eligible %s trend content',
    (platform) => {
      render(
        <TrendContentCard
          item={{
            ...item,
            contentType: 'video',
            platform,
            sourceReferenceId: `${platform}-reference-1`,
            trendId: `${platform}-trend-1`,
          }}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Remix' }));

      expect(mocks.openRemix).toHaveBeenCalledWith({
        kind: 'trend_reference',
        sourceReferenceId: `${platform}-reference-1`,
        trendId: `${platform}-trend-1`,
      });
      expect(screen.queryByRole('link', { name: 'Remix' })).toBeNull();
    },
  );

  it('falls back to the legacy remix link when the provider is missing on TikTok', () => {
    mocks.isRemixAvailable = false;
    render(
      <TrendContentCard
        item={{
          ...item,
          contentType: 'video',
          platform: 'tiktok',
          sourceReferenceId: 'tiktok-reference-1',
          trendId: 'tiktok-trend-1',
        }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Remix' })).toHaveAttribute(
      'href',
      '/org-1/brand-1/publishing/remix?platform=tiktok&sourceReferenceId=tiktok-reference-1&trendId=tiktok-trend-1',
    );
    expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
  });

  it('shows an unavailable remix control when YouTube has no provider or legacy path', () => {
    mocks.isRemixAvailable = false;
    render(
      <TrendContentCard
        item={{
          ...item,
          contentType: 'video',
          platform: 'youtube',
          sourceReferenceId: 'youtube-reference-1',
          trendId: 'youtube-trend-1',
        }}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Remix unavailable' }),
    ).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Remix' })).toBeNull();
  });

  it('does not offer direct remix when TikTok content has no durable source reference', () => {
    render(
      <TrendContentCard
        finding={{
          metadata: [],
          reference: { id: 'content-1', kind: 'research-trend-content' },
          title: 'TikTok context',
        }}
        item={{
          ...item,
          contentType: 'video',
          platform: 'tiktok',
          sourceReferenceId: undefined,
        }}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Use as context' }),
    ).toBeVisible();
  });

  it.each(['instagram', 'youtube'] as const)(
    'does not fall back to a legacy remix for %s content without a durable source reference',
    (platform) => {
      render(
        <TrendContentCard
          item={{
            ...item,
            contentType: 'video',
            platform,
            sourceReferenceId: undefined,
          }}
        />,
      );

      expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Remix' })).toBeNull();
    },
  );
});
