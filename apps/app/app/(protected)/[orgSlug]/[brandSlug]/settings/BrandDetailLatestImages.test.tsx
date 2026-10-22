import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IImage } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import type { LazyMasonryImage } from '@ui/lazy/masonry/LazyMasonry';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandDetailLatestImages from './BrandDetailLatestImages';

const navigation = vi.hoisted(() => ({
  scope: '/acme/moonrise',
  app: 'https://app.example.test',
}));
const masonry = vi.hoisted(() => ({
  render: vi.fn<(props: ComponentProps<typeof LazyMasonryImage>) => void>(),
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
  LazyMasonryImage: (props: ComponentProps<typeof LazyMasonryImage>) => {
    masonry.render(props);
    return <span>{props.image.id}</span>;
  },
}));

function makeImage(id: string): IImage {
  return {
    id,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isDeleted: false,
    category: IngredientCategory.IMAGE,
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

describe('BrandDetailLatestImages', () => {
  const emptyCases = [
    ['empty', <BrandDetailLatestImages key="empty" images={[]} />],
    [
      'undefined',
      // @ts-expect-error Defensive runtime contract: transport may omit the required array.
      <BrandDetailLatestImages key="undefined" images={undefined} />,
    ],
    // @ts-expect-error Defensive runtime contract: transport may return null.
    ['null', <BrandDetailLatestImages key="null" images={null} />],
  ] as const;

  it.each(emptyCases)(
    'preserves guidance and scoped anchors for %s input',
    (_state, element) => {
      render(element);
      expect(
        screen.getByRole('heading', { name: 'Latest Images' }),
      ).toBeVisible();
      const title = screen.getByText('No images yet');
      expect(title.tagName).toBe('P');
      expect(title).toHaveClass('text-sm font-medium text-foreground/70');
      expect(title.parentElement).toHaveClass(
        'flex flex-col items-center justify-center gap-1 px-4 py-8 text-center',
      );
      const description = screen.getByText(
        'Generate an image for this brand to populate this strip.',
      );
      expect(description.tagName).toBe('P');
      expect(description).toHaveClass(
        'max-w-xs text-xs leading-5 text-muted-foreground',
      );
      expect(
        screen.getByRole('link', { name: 'Create an image' }),
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
    const items = [makeImage('second'), makeImage('first')];
    render(<BrandDetailLatestImages images={items} />);
    const grid = screen.getByText('second').parentElement;
    expect(grid).toHaveClass('grid grid-cols-2 gap-2 sm:grid-cols-3');
    expect(
      Array.from(grid?.children ?? [], (node) => node.textContent),
    ).toEqual(['second', 'first']);
    expect(masonry.render).toHaveBeenCalledTimes(2);
    items.forEach((item, index) => {
      const props = masonry.render.mock.calls[index][0];
      expect(props.image).toBe(item);
      expect(props.isActionsEnabled).toBe(false);
      expect(props.isPublicGallery).toBe(false);
    });
    expect(screen.queryByText('No images yet')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Generate an image for this brand to populate this strip.',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Create an image' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      'https://app.example.test/acme/moonrise/library/assets',
    );
  });

  it('resolves a changed origin and scope on rerender, preserving demo links', () => {
    const { rerender } = render(<BrandDetailLatestImages images={[]} />);
    navigation.scope = '/demo/FUDNEWS';
    navigation.app = 'https://app.genfeed.ai';
    rerender(<BrandDetailLatestImages images={[]} />);
    expect(
      screen.getByRole('link', { name: 'Create an image' }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/demo/FUDNEWS/agent/new');
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/demo/FUDNEWS/library/assets',
    );
  });
});
