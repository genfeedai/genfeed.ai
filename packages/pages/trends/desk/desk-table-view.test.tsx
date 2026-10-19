import DeskTableView from '@pages/trends/desk/desk-table-view';
import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => 'brand-1',
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));
vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () => null,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function video(id: string, url: string): DiscoveryDeskItem {
  return {
    contentType: 'video',
    engagement: 10,
    id,
    key: `viral_video:${id}`,
    kind: 'viral_video',
    matchedTrends: [],
    metrics: {},
    platform: 'youtube',
    raw: {
      kind: 'viral_video',
      video: {
        id,
        videoUrl: url,
        platform: 'youtube',
        creatorHandle: 'creator',
        engagementRate: 0,
        velocity: 0,
        viralScore: 10,
      },
    },
    remixSelector: null,
    source: 'trends',
    mediaUrl: url,
    title: id,
    velocity: 0,
    virality: 10,
  };
}

function trendFinding(): DiscoveryDeskItem {
  return {
    ...video('Rising sound', 'https://youtube.com/watch?v=dQw4w9WgXcQ'),
    key: 'trend:t-1',
    kind: 'trend',
    raw: {
      item: { trendId: 'trend-9' },
      kind: 'trend',
    },
    text: 'Full caption body',
    title: 'Rising sound',
  } as unknown as DiscoveryDeskItem;
}

describe('Discovery table previews', () => {
  it('keeps hover independent of expansion and supports collapse while hovered', async () => {
    render(
      <DeskTableView
        cursorKey={null}
        href={(path) => path}
        items={[
          video('First video', 'https://youtube.com/watch?v=dQw4w9WgXcQ'),
        ]}
        onCursor={vi.fn()}
        onToggleSelect={vi.fn()}
        selection={new Set()}
      />,
    );
    const title = screen.getByText('First video');
    const row = title.closest('tr') as HTMLElement;
    fireEvent.pointerEnter(title);
    await screen.findByTitle('First video');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    fireEvent.click(row);
    // Expanding closes the hover card; the inline detail owns the preview.
    await waitFor(() =>
      expect(document.querySelectorAll('iframe')).toHaveLength(1),
    );
    fireEvent.click(row);
    fireEvent.pointerLeave(title);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('previews one video without changing row expansion', async () => {
    render(
      <DeskTableView
        cursorKey={null}
        href={(path) => path}
        items={[
          video('First video', 'https://youtube.com/watch?v=dQw4w9WgXcQ'),
          video('Second video', 'https://youtube.com/watch?v=jNQXAC9IVRw'),
        ]}
        onCursor={vi.fn()}
        onToggleSelect={vi.fn()}
        selection={new Set()}
      />,
    );
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    fireEvent.pointerEnter(screen.getByText('First video'));
    await screen.findByTitle('First video');
    fireEvent.pointerEnter(screen.getByText('Second video'));
    await screen.findByTitle('Second video');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(screen.queryByTitle('First video')).not.toBeInTheDocument();
    fireEvent.pointerLeave(screen.getByText('Second video'));
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });
});

describe('Discovery table row contract', () => {
  it('links a trend finding to its page and leaves other findings unlinked', () => {
    render(
      <DeskTableView
        cursorKey={null}
        href={(path) => `/acme/moonrise${path}`}
        items={[
          trendFinding(),
          video('First video', 'https://youtube.com/watch?v=dQw4w9WgXcQ'),
        ]}
        onCursor={vi.fn()}
        onToggleSelect={vi.fn()}
        selection={new Set()}
      />,
    );

    expect(screen.getByRole('link', { name: 'Rising sound' })).toHaveAttribute(
      'href',
      '/acme/moonrise/discovery/trends/detail/trend-9',
    );
    expect(
      screen.queryByRole('link', { name: 'First video' }),
    ).not.toBeInTheDocument();
  });

  it('selects the finding into the sidebar on a row click when embedded', () => {
    const onCursor = vi.fn();
    const onSelectFinding = vi.fn();
    const finding = trendFinding();
    render(
      <DeskTableView
        cursorKey={null}
        href={(path) => path}
        items={[finding]}
        onCursor={onCursor}
        onSelectFinding={onSelectFinding}
        onToggleSelect={vi.fn()}
        selection={new Set()}
      />,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Rising sound' }));
    expect(onSelectFinding).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByText('Full caption body').closest('tr') as HTMLElement,
    );
    expect(onCursor).toHaveBeenCalledWith('trend:t-1');
    expect(onSelectFinding).toHaveBeenCalledWith(finding);
    // The sidebar owns the detail, so nothing expands beneath the row.
    expect(screen.getAllByText('Full caption body')).toHaveLength(1);
  });

  it('expands the finding inline on a row click when there is no sidebar', () => {
    render(
      <DeskTableView
        cursorKey={null}
        href={(path) => path}
        items={[trendFinding()]}
        onCursor={vi.fn()}
        onToggleSelect={vi.fn()}
        selection={new Set()}
      />,
    );

    const row = screen
      .getByText('Full caption body')
      .closest('tr') as HTMLElement;
    fireEvent.click(row);
    expect(screen.getAllByText('Full caption body')).toHaveLength(2);
    fireEvent.click(row);
    expect(screen.getAllByText('Full caption body')).toHaveLength(1);
  });
});
