import '@testing-library/jest-dom/vitest';
import type { TrendContentItem } from '@props/trends/trends-page.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isRemixAvailable: true,
  isPseudo: false,
  brandId: 'brand-1' as string | null,
  copyToClipboard: vi.fn(),
  createResearchBriefRun: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  openRemix: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog, translateFromPseudoCatalog } = await import(
    '@app-tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) =>
      (mocks.isPseudo ? translateFromPseudoCatalog : translateFromCatalog)(
        namespace,
      ),
  };
});
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => ({ brandSlug: 'brand-1', orgSlug: 'org-1' }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mocks.brandId,
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org-1/brand-1${path}` }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createResearchBriefRun: mocks.createResearchBriefRun,
  }),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notifyError,
      success: mocks.notifySuccess,
    }),
  },
}));
vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () =>
    mocks.isRemixAvailable ? { openRemix: mocks.openRemix } : null,
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({ copyToClipboard: mocks.copyToClipboard }),
  },
}));

import { translateFromPseudoCatalog } from '@app-tests/next-intl.stub';
import TrendContentCard from './trend-content-card';

// Radix opens the dropdown on pointerdown, which jsdom does not synthesize
// from a click — fire both, as the other overflow-menu specs do.
function openOverflow() {
  const trigger = screen.getByRole('button', {
    name: mocks.isPseudo
      ? translateFromPseudoCatalog('ui.collection')('moreActions')
      : 'More actions',
  });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
}

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
    mocks.isPseudo = false;
    mocks.brandId = 'brand-1';
    mocks.copyToClipboard.mockResolvedValue(undefined);
    mocks.createResearchBriefRun.mockResolvedValue({ id: 'run-1' });
  });

  it.each(['live', 'fallback'] as const)(
    'localizes the %s source badge',
    (sourcePreviewState) => {
      mocks.isPseudo = true;
      const translate = translateFromPseudoCatalog('common.trends.card');
      render(
        <TrendContentCard
          item={{
            ...item,
            sourcePreviewState,
            thumbnailUrl: 'https://example.com/preview.jpg',
          }}
        />,
      );
      expect(
        screen.getByText(translate(`sourceStatus.${sourcePreviewState}`)),
      ).toBeVisible();
      expect(screen.queryByText('Live source')).toBeNull();
      expect(screen.queryByText('Saved fallback')).toBeNull();
    },
  );

  it.each([false, true])(
    'localizes copy-prompt notifications (failure: %s)',
    async (isFailure) => {
      mocks.isPseudo = true;
      if (isFailure)
        mocks.copyToClipboard.mockRejectedValue(
          new Error('clipboard unavailable'),
        );
      const translate = translateFromPseudoCatalog('common.trends.card');
      render(<TrendContentCard item={item} />);
      openOverflow();
      fireEvent.click(
        screen.getByRole('menuitem', { name: translate('actions.copyPrompt') }),
      );
      await waitFor(() =>
        expect(
          isFailure ? mocks.notifyError : mocks.notifySuccess,
        ).toHaveBeenCalledWith(
          isFailure
            ? translate('notifications.copyPromptFailed')
            : translate('notifications.promptCopied'),
        ),
      );
    },
  );

  it.each(['success', 'failure', 'missing-brand'] as const)(
    'localizes save-brief notifications: %s',
    async (outcome) => {
      mocks.isPseudo = true;
      if (outcome === 'failure')
        mocks.createResearchBriefRun.mockRejectedValue(
          new Error('brief unavailable'),
        );
      if (outcome === 'missing-brand') mocks.brandId = null;
      const translate = translateFromPseudoCatalog('common.trends.card');
      render(<TrendContentCard item={item} />);
      openOverflow();
      fireEvent.click(
        screen.getByRole('menuitem', { name: translate('actions.saveBrief') }),
      );
      const expected =
        outcome === 'success'
          ? translate('notifications.briefSaved')
          : outcome === 'failure'
            ? translate('notifications.saveBriefFailed')
            : translate('notifications.selectBrand');
      await waitFor(() =>
        expect(
          outcome === 'success' ? mocks.notifySuccess : mocks.notifyError,
        ).toHaveBeenCalledWith(expected),
      );
      if (outcome === 'missing-brand')
        expect(mocks.createResearchBriefRun).not.toHaveBeenCalled();
    },
  );

  it('opens Discovery remix for an imported X trend reference', () => {
    render(<TrendContentCard item={item} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remix' }));

    expect(mocks.openRemix).toHaveBeenCalledWith({
      kind: 'trend_reference',
      sourceReferenceId: 'reference-1',
      trendId: 'trend-1',
    });
    expect(screen.queryByRole('link', { name: 'Remix' })).toBeNull();
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

  it.each(['instagram', 'youtube', 'twitter'] as const)(
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

  it('falls back to Studio generate when the Discovery surface is missing on TikTok', () => {
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
      '/org-1/brand-1/studio/generate?platform=tiktok&sourceReferenceId=tiktok-reference-1&trendId=tiktok-trend-1',
    );
    expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
  });

  it('shows an unavailable remix control when YouTube has no Discovery surface or variation page', () => {
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
        onSelectAction={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
    // Use as context lives in the overflow menu, never beside Remix.
    expect(screen.queryByRole('button', { name: 'Use as context' })).toBeNull();
  });

  it('shows Remix as the only visible action and moves the rest to overflow', async () => {
    const onSelectAction = vi.fn();
    const finding = {
      metadata: [],
      reference: { id: 'content-1', kind: 'research-trend-content' as const },
      title: 'X context',
    };
    render(
      <TrendContentCard
        finding={finding}
        item={item}
        onSelectAction={onSelectAction}
      />,
    );

    expect(
      screen
        .getAllByRole('button')
        .map(
          (button) => button.getAttribute('aria-label') ?? button.textContent,
        ),
    ).toEqual(['Remix', 'More actions']);

    openOverflow();

    expect(
      (await screen.findAllByRole('menuitem')).map((menuItem) =>
        menuItem.textContent?.trim(),
      ),
    ).toEqual([
      'Use as context',
      'Save brief',
      'Copy prompt',
      'Open source',
      'Send to agent',
    ]);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Use as context' }));
    expect(onSelectAction).toHaveBeenCalledWith(finding);
  });

  it('renders Open source and Send to agent as real links in the keyboard-opened menu', async () => {
    const user = userEvent.setup();
    render(<TrendContentCard item={item} />);

    const trigger = screen.getByRole('button', {
      name: mocks.isPseudo
        ? translateFromPseudoCatalog('ui.collection')('moreActions')
        : 'More actions',
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    const source = screen.getByRole('menuitem', { name: 'Open source' });
    expect(source.tagName).toBe('A');
    expect(source).toHaveAttribute('href', 'https://x.com/source/status/1');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');

    const agent = screen.getByRole('menuitem', { name: 'Send to agent' });
    expect(agent.tagName).toBe('A');
    expect(agent.getAttribute('href')).toContain('prompt=');
    expect(agent).not.toHaveAttribute('target');

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('omits Open source when the source URL is not a safe http(s) link', async () => {
    render(
      <TrendContentCard item={{ ...item, sourceUrl: 'javascript:alert(1)' }} />,
    );

    openOverflow();
    await screen.findByRole('menu');

    expect(
      screen.queryByRole('menuitem', { name: 'Open source' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Send to agent' }),
    ).toBeInTheDocument();
  });

  it('marks the selected finding and disables re-selecting it', async () => {
    const { container } = render(
      <TrendContentCard
        finding={{
          metadata: [],
          reference: { id: 'content-1', kind: 'research-trend-content' },
          title: 'X context',
        }}
        isSelected
        item={item}
        onSelectAction={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveClass('ring-primary/50');

    openOverflow();

    expect(
      await screen.findByRole('menuitem', { name: 'Selected for context' }),
    ).toHaveAttribute('data-disabled');
  });

  it('renders on the shared card surface without glass or lift classes', () => {
    const { container } = render(<TrendContentCard item={item} />);
    const card = container.firstElementChild as HTMLElement;

    expect(card).toHaveClass('rounded-card', 'shadow-border');
    expect(card.className).not.toMatch(/gen-glass|gen-hover-lift|rounded-lg/);
  });

  it.each(['instagram', 'youtube'] as const)(
    'does not fall back to Studio generate for %s content without a durable source reference',
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
