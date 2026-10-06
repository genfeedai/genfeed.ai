import type {
  DeskLightTableViewProps,
  DiscoveryDeskItem,
} from '@props/trends/discovery-desk.props';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isPseudo: false,
  navigate: vi.fn(),
  openRemix: vi.fn().mockResolvedValue(undefined),
}));

// jsdom cannot navigate: record activations and forward every prop so Radix
// can turn the anchor into a menu item.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          mocks.navigate(href);
        }
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock('next-intl', async () => {
  const { DEFAULT_LOCALE, PSEUDO_LOCALE } = await import(
    '@genfeedai/contracts/constants'
  );
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  const { loadMessages } = await import('@app-tests/../i18n/messages');
  return {
    useTranslations: (namespace: string) =>
      createTranslateFromCatalog(
        loadMessages(mocks.isPseudo ? PSEUDO_LOCALE : DEFAULT_LOCALE),
      )(namespace),
  };
});

import { translateFromPseudoCatalog } from '@app-tests/next-intl.stub';

vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () => ({ openRemix: mocks.openRemix }),
}));

import DeskLightTableView from './desk-light-table-view';

function buildItem(
  overrides: Partial<DiscoveryDeskItem> = {},
): DiscoveryDeskItem {
  const key = overrides.key ?? 'trend:default';
  return {
    authorHandle: 'builderx',
    contentType: 'post',
    engagement: 100,
    id: key,
    key,
    kind: 'trend',
    matchedTrends: ['#AIAgents'],
    metrics: { likes: 100 },
    platform: 'twitter',
    raw: {
      item: {
        id: key,
        platform: 'twitter',
        text: 'AI agents keep shipping',
        title: 'AI agents keep shipping',
        trendTopic: '#AIAgents',
        trendViralityScore: 80,
      },
      kind: 'trend',
    },
    remixSelector: {
      kind: 'trend_reference',
      sourceReferenceId: `ref-${key}`,
      trendId: `trend-${key}`,
    },
    source: 'trends',
    sourceUrl: 'https://x.com/builderx/status/1',
    text: 'AI agents keep shipping',
    title: 'AI agents keep shipping',
    trendTopic: '#AIAgents',
    velocity: 10,
    virality: 80,
    ...overrides,
  } as DiscoveryDeskItem;
}

const ITEM = buildItem({ key: 'trend:one', title: 'First signal' });

function renderView(overrides: Partial<DeskLightTableViewProps> = {}) {
  const props: DeskLightTableViewProps = {
    cursorKey: null,
    href: (path) => path,
    items: [ITEM],
    onCursor: vi.fn(),
    onSelectFinding: vi.fn(),
    onToggleSelect: vi.fn(),
    selection: new Set<string>(),
    ...overrides,
  };
  render(<DeskLightTableView {...props} />);
  return props;
}

function getCard() {
  return screen.getByTestId(`desk-light-card-${ITEM.key}`);
}

// Radix opens the dropdown on pointerdown, which jsdom does not synthesize
// from a click — fire both, as the other overflow-menu specs do.
function openOverflow() {
  const trigger = within(getCard()).getByRole('button', {
    name: 'More actions',
  });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
}

describe('DeskLightTableView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPseudo = false;
  });

  it('localizes the untitled fallback and selection label without changing selection behavior', () => {
    mocks.isPseudo = true;
    const translate = translateFromPseudoCatalog('common.trends.card');
    const item = buildItem({ title: '', text: '', trendTopic: '' });
    const props = renderView({ items: [item] });
    expect(screen.getByText(translate('untitled'))).toBeVisible();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: translate('select', { title: item.key }),
      }),
    );
    expect(props.onToggleSelect).toHaveBeenCalledWith(item.key);
    expect(screen.queryByText('Untitled')).toBeNull();
  });

  it('lays cards out on the container-query ladder, up to four columns', () => {
    renderView();

    const wrapper = screen.getByTestId('desk-light-table-grid');
    const grid = wrapper.firstElementChild as HTMLElement;

    expect(wrapper).toHaveClass('@container');
    expect(grid).toHaveClass('@[80rem]:grid-cols-4', 'gap-4');
    expect(grid.className).not.toMatch(/(^|\s)(sm|md|lg|xl):grid-cols/);
  });

  it('renders each card on the shared Card surface, without glass or lift', () => {
    renderView();

    const card = getCard();
    expect(card).toHaveClass('rounded-card', 'shadow-border');
    expect(card.className).not.toMatch(/gen-glass|gen-hover-lift/);
    expect(card.tagName).not.toBe('BUTTON');
  });

  it('shows Remix as the only visible action beside the selection checkbox', () => {
    renderView();

    const card = within(getCard());
    // The first button is the card's cursor target (its media and copy), not
    // an action; after it come exactly Remix and the overflow trigger.
    expect(
      card
        .getAllByRole('button')
        .map(
          (button) =>
            button.getAttribute('aria-label') ?? button.textContent?.trim(),
        ),
    ).toEqual([
      expect.stringContaining('First signal'),
      'Remix',
      'More actions',
    ]);
    expect(card.getByRole('checkbox', { name: 'Select First signal' })).toBe(
      card.getByRole('checkbox'),
    );
    expect(card.queryByRole('button', { name: 'Use as context' })).toBeNull();
    expect(card.queryByRole('button', { name: 'Open source' })).toBeNull();
  });

  it('keeps the overflow menu closed until its trigger is used', () => {
    renderView();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Use as context')).not.toBeInTheDocument();
  });

  it('opens the real overflow menu from the keyboard with Use as context and an Open source link', async () => {
    const user = userEvent.setup();
    const props = renderView();

    const trigger = within(getCard()).getByRole('button', {
      name: 'More actions',
    });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    expect(
      screen
        .getAllByRole('menuitem')
        .map((menuItem) => menuItem.textContent?.trim()),
    ).toEqual(['Use as context', 'Open source']);

    const source = screen.getByRole('menuitem', { name: 'Open source' });
    expect(source.tagName).toBe('A');
    expect(source).toHaveAttribute('href', 'https://x.com/builderx/status/1');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');

    await user.click(screen.getByRole('menuitem', { name: 'Use as context' }));
    expect(props.onSelectFinding).toHaveBeenCalledWith(ITEM);
    expect(props.onCursor).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it('closes the overflow menu on Escape and returns focus to its trigger', async () => {
    const user = userEvent.setup();
    renderView();

    const trigger = within(getCard()).getByRole('button', {
      name: 'More actions',
    });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it('omits Open source when the source URL is not a safe http(s) link', async () => {
    renderView({
      items: [{ ...ITEM, sourceUrl: 'javascript:alert(1)' }],
    });

    openOverflow();
    await screen.findByRole('menu');

    expect(
      screen.queryByRole('menuitem', { name: 'Open source' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Use as context' }),
    ).toBeInTheDocument();
  });

  it('opens the Discovery remix from the primary action without moving the cursor', () => {
    const props = renderView();

    fireEvent.click(within(getCard()).getByRole('button', { name: 'Remix' }));

    expect(mocks.openRemix).toHaveBeenCalledWith(ITEM.remixSelector);
    expect(props.onCursor).not.toHaveBeenCalled();
  });

  it('keeps selection and cursor as separate targets', () => {
    const props = renderView();
    const card = within(getCard());

    fireEvent.click(card.getByRole('checkbox'));
    expect(props.onToggleSelect).toHaveBeenCalledWith(ITEM.key);
    expect(props.onCursor).not.toHaveBeenCalled();

    fireEvent.click(card.getByText('First signal'));
    expect(props.onCursor).toHaveBeenCalledWith(ITEM.key);
  });

  it('hides the overflow menu when there is nothing to put in it', () => {
    renderView({
      items: [{ ...ITEM, sourceUrl: undefined }],
      onSelectFinding: undefined,
    });

    expect(
      within(getCard()).queryByRole('button', { name: 'More actions' }),
    ).toBeNull();
    expect(
      within(getCard()).getByRole('button', { name: 'Remix' }),
    ).toBeVisible();
  });

  it('loads only the hovered video, muted, and stops it on pointer leave', async () => {
    const videos = [
      {
        ...ITEM,
        key: 'video:first',
        id: 'first',
        contentType: 'video' as const,
        title: 'First video',
        mediaUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
        thumbnailUrl: 'https://cdn.example.com/poster.jpg',
      },
      {
        ...ITEM,
        key: 'video:second',
        id: 'second',
        contentType: 'video' as const,
        title: 'Second video',
        mediaUrl: 'https://www.tiktok.com/@creator/video/6718335390845095173',
      },
    ];
    renderView({ items: videos });
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    const first = screen.getByRole('button', { name: /First video/ });
    const second = screen.getByRole('button', { name: /Second video/ });
    fireEvent.pointerEnter(first);
    const youtube = await screen.findByTitle('First video');
    expect(youtube).toHaveAttribute('src', expect.stringContaining('mute=1'));
    fireEvent.pointerEnter(second);
    await screen.findByTitle('Second video');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(screen.queryByTitle('First video')).not.toBeInTheDocument();
    fireEvent.pointerLeave(second);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('keeps Remix visible but disabled when the item cannot be remixed', () => {
    renderView({ items: [{ ...ITEM, remixSelector: null }] });

    expect(
      within(getCard()).getByRole('button', { name: 'Remix' }),
    ).toBeDisabled();
  });
});
