import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IVideo } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import type { LazyMasonryVideo } from '@ui/lazy/masonry/LazyMasonry';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandDetailLatestVideos from './BrandDetailLatestVideos';

const navigation = vi.hoisted(() => ({
  scope: '/acme/moonrise',
  app: 'https://app.example.test',
}));
const masonry = vi.hoisted(() => ({
  render: vi.fn<(props: ComponentProps<typeof LazyMasonryVideo>) => void>(),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `${navigation.scope}${path}` }),
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    get apps() {
      return { app: navigation.app };
    },
  },
}));
vi.mock('@ui/lazy/masonry/LazyMasonry', () => ({
  LazyMasonryVideo: (props: ComponentProps<typeof LazyMasonryVideo>) => {
    masonry.render(props);
    return <span>{props.video.id}</span>;
  },
}));

function makeVideo(id: string): IVideo {
  return {
    id,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isDeleted: false,
    category: IngredientCategory.VIDEO,
    status: IngredientStatus.GENERATED,
    scope: AssetScope.BRAND,
    user: 'user-1',
    organization: 'org-1',
    isHighlighted: false,
    isDefault: false,
    isFavorite: false,
    totalVotes: 0,
    totalChildren: 0,
    hasVoted: false,
    isVoteAnimating: false,
  };
}

beforeEach(() => {
  navigation.scope = '/acme/moonrise';
  navigation.app = 'https://app.example.test';
});

describe('BrandDetailLatestVideos', () => {
  const emptyCases = [
    ['empty', <BrandDetailLatestVideos key="empty" videos={[]} />],
    [
      'undefined',
      // @ts-expect-error Defensive runtime contract: transport may omit the required array.
      <BrandDetailLatestVideos key="undefined" videos={undefined} />,
    ],
    // @ts-expect-error Defensive runtime contract: transport may return null.
    ['null', <BrandDetailLatestVideos key="null" videos={null} />],
  ] as const;

  it.each(emptyCases)(
    'preserves scoped anchors for %s input',
    (_state, element) => {
      render(element);
      expect(
        screen.getByRole('heading', { name: 'Latest Videos' }),
      ).toBeVisible();
      const title = screen.getByText('No videos yet');
      expect(title.tagName).toBe('P');
      expect(title).toHaveClass('text-sm font-medium text-foreground/70');
      expect(title.parentElement).toHaveClass(
        'flex flex-col items-center justify-center gap-1 px-4 py-8 text-center',
      );
      expect(
        screen.getByRole('link', { name: 'Create a video' }),
      ).toHaveAttribute(
        'href',
        'https://app.example.test/acme/moonrise/agent/new',
      );
      expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
        'href',
        'https://app.example.test/acme/moonrise/library/assets',
      );
      expect(masonry.render).not.toHaveBeenCalled();
    },
  );

  it('preserves original media objects, order, grid and masonry flags', () => {
    const items = [makeVideo('second'), makeVideo('first')];
    render(<BrandDetailLatestVideos videos={items} />);
    const grid = screen.getByText('second').parentElement;
    expect(grid).toHaveClass('grid grid-cols-2 gap-2 sm:grid-cols-3');
    expect(
      Array.from(grid?.children ?? [], (node) => node.textContent),
    ).toEqual(['second', 'first']);
    expect(masonry.render).toHaveBeenCalledTimes(2);
    items.forEach((item, index) => {
      const props = masonry.render.mock.calls[index][0];
      expect(props.video).toBe(item);
      expect(props.isActionsEnabled).toBe(false);
      expect(props.isPublicGallery).toBe(false);
    });
    expect(screen.queryByText('No videos yet')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Create a video' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      'https://app.example.test/acme/moonrise/library/assets',
    );
  });

  it('resolves a changed origin and scope on rerender, preserving demo links', () => {
    const { rerender } = render(<BrandDetailLatestVideos videos={[]} />);
    navigation.scope = '/demo/FUDNEWS';
    navigation.app = 'https://app.genfeed.ai';
    rerender(<BrandDetailLatestVideos videos={[]} />);
    expect(
      screen.getByRole('link', { name: 'Create a video' }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/demo/FUDNEWS/agent/new');
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/demo/FUDNEWS/library/assets',
    );
  });
});
