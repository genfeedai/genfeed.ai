import type { Ingredient } from '@models/content/ingredient.model';
import type { Post } from '@models/content/post.model';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicPosts = vi.fn<() => Promise<Post[]>>();
const getPublicIngredient = vi.fn<() => Promise<Ingredient | null>>();

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({ findPublicPosts, getPublicIngredient }),
  },
}));

const { default: IngredientPostsPage, generateMetadata } = await import(
  './page'
);
const { getPublicIngredientByIdCached, getPublicIngredientPostsPageData } =
  await import('./posts-loader');

const POSTS = [{ id: 'p1' }] as unknown as Post[];

function ingredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'ing-1',
    metadataLabel: 'Cinematic Reels',
    thumbnailUrl: 'https://cdn.genfeed.ai/thumb.jpg',
    ...overrides,
  } as Ingredient;
}

beforeEach(() => {
  findPublicPosts.mockReset();
  getPublicIngredient.mockReset();
  findPublicPosts.mockResolvedValue(POSTS);
  getPublicIngredient.mockResolvedValue(ingredient());
});

describe('getPublicIngredientByIdCached', () => {
  it('delegates to the public service', async () => {
    await expect(getPublicIngredientByIdCached('ing-a')).resolves.toMatchObject(
      { id: 'ing-1' },
    );
  });
});

describe('getPublicIngredientPostsPageData', () => {
  it('loads the ingredient and its posts for the requested page', async () => {
    const data = await getPublicIngredientPostsPageData('ing-b', 2);

    expect(data.ingredient).toMatchObject({ id: 'ing-1' });
    expect(data.posts).toBe(POSTS);
    expect(findPublicPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredient: 'ing-b',
        page: 2,
        sort: 'createdAt: -1',
      }),
    );
  });
});

describe('generateMetadata', () => {
  it('titles the page after the ingredient label', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ id: 'meta-1' }),
    });

    expect(String(meta.title)).toContain('Cinematic Reels');
    expect(meta.description).toBe(
      'Browse all posts created with Cinematic Reels',
    );
    expect(meta.alternates?.canonical).toContain('/posts/meta-1');
    expect(meta.twitter?.creator).toBe('@genfeedai');
  });

  it('falls back to a default label and card image', async () => {
    getPublicIngredient.mockResolvedValue(
      ingredient({ metadataLabel: undefined, thumbnailUrl: undefined }),
    );

    const meta = await generateMetadata({
      params: Promise.resolve({ id: 'meta-2' }),
    });

    expect(String(meta.title)).toContain('Ingredient');
    expect(meta.openGraph?.images).toBeTruthy();
  });

  it('reports "Ingredient not found" when the API has nothing', async () => {
    getPublicIngredient.mockResolvedValue(null);

    const meta = await generateMetadata({
      params: Promise.resolve({ id: 'meta-3' }),
    });

    expect(meta.title).toBe('Ingredient not found');
  });

  it('treats the sentinel "undefined" id as not found', async () => {
    getPublicIngredient.mockResolvedValue(ingredient({ id: 'undefined' }));

    const meta = await generateMetadata({
      params: Promise.resolve({ id: 'meta-4' }),
    });

    expect(meta.title).toBe('Ingredient not found');
  });
});

describe('IngredientPostsPage', () => {
  it('passes the loaded ingredient and posts into the list', async () => {
    const element = (await IngredientPostsPage({
      params: Promise.resolve({ id: 'route-1' }),
      searchParams: Promise.resolve({}),
    })) as ReactElement<{
      children: ReactElement<{ id: string; posts: Post[] }>;
    }>;

    expect(element.props.children.props.id).toBe('route-1');
    expect(element.props.children.props.posts).toBe(POSTS);
    expect(findPublicPosts).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });

  it.each([
    ['a numeric page', '5', 5],
    ['a non-numeric page', 'abc', 1],
    ['a zero page', '0', 1],
  ])('resolves %s to page %s', async (_label, raw, expected) => {
    await IngredientPostsPage({
      params: Promise.resolve({ id: `route-page-${raw}` }),
      searchParams: Promise.resolve({ page: raw }),
    });

    expect(findPublicPosts).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: expected }),
    );
  });
});
