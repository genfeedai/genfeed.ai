import '@testing-library/jest-dom/vitest';
import type { TrendContentItem } from '@props/trends/trends-page.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      'actions.saveBrief': 'Save brief',
      'actions.savingBrief': 'Saving brief…',
      'actions.selectedAsContext': 'Selected for context',
      'actions.sendToAgent': 'Send to agent',
      'actions.useAsContext': 'Use as context',
      moreActions: 'More actions',
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

// Radix opens the dropdown on pointerdown, which jsdom does not synthesize
// from a click — fire both, as the other overflow-menu specs do.
function openOverflow() {
  const trigger = screen.getByRole('button', { name: 'More actions' });
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
  });

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

    const trigger = screen.getByRole('button', { name: 'More actions' });
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
});
