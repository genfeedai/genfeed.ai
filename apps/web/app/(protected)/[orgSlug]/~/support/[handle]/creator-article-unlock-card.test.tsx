// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreatorArticleUnlockCard from './creator-article-unlock-card';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const { getAccessMock, getService, unlockMock } = vi.hoisted(() => {
  const mocks = { getAccessMock: vi.fn(), unlockMock: vi.fn() };
  // Stable like the real hook: the effect loads access once.
  const service = {
    getArticleAccess: mocks.getAccessMock,
    unlockArticle: mocks.unlockMock,
  };
  return { ...mocks, getService: async () => service };
});

vi.mock('@genfeedai/hooks/navigation/use-route-params', () => ({
  useRouteParams: () => ({ handle: 'ada', orgSlug: 'acme' }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('article=article_1'),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const LOCKED = {
  accessLevel: 'paid',
  articleId: 'article_1',
  content: null,
  handle: 'ada',
  hasAccess: false,
  label: 'Launch notes',
  reason: null,
  slug: 'launch-notes',
  subscriptionPriceCredits: 40,
  unlockPriceCredits: 25,
};

describe('CreatorArticleUnlockCard', () => {
  beforeEach(() => {
    getAccessMock.mockReset();
    unlockMock.mockReset();
  });

  it('unlocks the article and links back to it', async () => {
    getAccessMock.mockResolvedValue(LOCKED);
    unlockMock.mockResolvedValue({
      access: { ...LOCKED, content: '<p>All</p>', hasAccess: true },
      transferId: 'transfer_1',
      wasApplied: true,
    });
    render(<CreatorArticleUnlockCard />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Unlock for 25 credits' }),
    );

    expect(
      await screen.findByText('You can read “Launch notes”'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Read the article' }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/@ada/articles/launch-notes'),
    );
  });

  it('points a subscribers-only article to the subscription', async () => {
    getAccessMock.mockResolvedValue({ ...LOCKED, unlockPriceCredits: null });
    render(<CreatorArticleUnlockCard />);

    expect(
      await screen.findByText('“Launch notes” is for subscribers'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks for credits when the workspace cannot pay', async () => {
    getAccessMock.mockResolvedValue(LOCKED);
    unlockMock.mockRejectedValue({
      response: { data: { errors: [{ code: 'INSUFFICIENT_CREDITS' }] } },
    });
    render(<CreatorArticleUnlockCard />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Unlock for 25 credits' }),
    );

    expect(await screen.findByText('Not enough credits')).toBeInTheDocument();
  });
});
