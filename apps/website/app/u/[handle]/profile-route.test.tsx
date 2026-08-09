import type { Article } from '@models/content/article.model';
import type { Image as ImageModel } from '@models/ingredients/image.model';
import type { Video } from '@models/ingredients/video.model';
import type { Brand } from '@models/organization/brand.model';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicProfileBySlug = vi.fn<() => Promise<Brand | null>>();
const findPublicVideos = vi.fn<() => Promise<Video[]>>();
const findPublicImages = vi.fn<() => Promise<ImageModel[]>>();
const findPublicArticles = vi.fn<() => Promise<Article[]>>();

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({
      findPublicArticles,
      findPublicImages,
      findPublicProfileBySlug,
      findPublicVideos,
    }),
  },
}));

const infoSpy = vi.fn();
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: infoSpy, warn: vi.fn() },
}));

const { default: PublicProfile, generateMetadata } = await import('./page');
const { getPublicBrandBySlug, getPublicProfilePageData } = await import(
  './profile-loader'
);

const EMPTY_PARENT = Promise.resolve({}) as unknown as Parameters<
  typeof generateMetadata
>[1];

const VIDEOS = [{ id: 'v1' }] as unknown as Video[];
const IMAGES = [{ id: 'i1' }] as unknown as ImageModel[];
const ARTICLES = [{ id: 'a1' }] as unknown as Article[];

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    bannerUrl: 'https://cdn.genfeed.ai/banner.jpg',
    description: 'We make things.',
    id: 'brand-1',
    label: 'Acme Studio',
    links: [{ id: 'l1' }],
    twitterHandle: 'acme',
    ...overrides,
  } as Brand;
}

beforeEach(() => {
  findPublicProfileBySlug.mockReset();
  findPublicVideos.mockReset();
  findPublicImages.mockReset();
  findPublicArticles.mockReset();
  infoSpy.mockReset();
  findPublicProfileBySlug.mockResolvedValue(brand());
  findPublicVideos.mockResolvedValue(VIDEOS);
  findPublicImages.mockResolvedValue(IMAGES);
  findPublicArticles.mockResolvedValue(ARTICLES);
});

describe('getPublicBrandBySlug', () => {
  it('returns the brand the service resolves', async () => {
    await expect(getPublicBrandBySlug('loader-ok')).resolves.toMatchObject({
      id: 'brand-1',
    });
  });

  it('swallows a service failure and returns null', async () => {
    findPublicProfileBySlug.mockRejectedValue(new Error('offline'));

    await expect(getPublicBrandBySlug('loader-fail')).resolves.toBeNull();
  });
});

describe('getPublicProfilePageData', () => {
  it('collects videos, images, articles and the brand links', async () => {
    const data = await getPublicProfilePageData('page-data-ok');

    expect(data.brand).toMatchObject({ id: 'brand-1' });
    expect(data.videos).toBe(VIDEOS);
    expect(data.images).toBe(IMAGES);
    expect(data.articles).toBe(ARTICLES);
    expect(data.links).toEqual([{ id: 'l1' }]);
  });

  it('returns empty collections when a sub-request rejects', async () => {
    findPublicVideos.mockRejectedValue(new Error('videos down'));
    findPublicImages.mockRejectedValue(new Error('images down'));
    findPublicArticles.mockRejectedValue(new Error('articles down'));

    const data = await getPublicProfilePageData('page-data-partial');

    expect(data.videos).toEqual([]);
    expect(data.images).toEqual([]);
    expect(data.articles).toEqual([]);
    expect(data.brand).toMatchObject({ id: 'brand-1' });
  });

  it('short-circuits to an empty payload when the brand is missing', async () => {
    findPublicProfileBySlug.mockResolvedValue(null);

    const data = await getPublicProfilePageData('page-data-missing');

    expect(data).toEqual({
      articles: [],
      brand: null,
      images: [],
      links: [],
      videos: [],
    });
    expect(findPublicVideos).not.toHaveBeenCalled();
  });

  it('defaults links to an empty list when the brand has none', async () => {
    findPublicProfileBySlug.mockResolvedValue(brand({ links: undefined }));

    const data = await getPublicProfilePageData('page-data-no-links');

    expect(data.links).toEqual([]);
  });
});

describe('generateMetadata', () => {
  it('builds a large summary card from the brand', async () => {
    const meta = await generateMetadata(
      { params: Promise.resolve({ handle: 'meta-brand' }) },
      EMPTY_PARENT,
    );

    expect(meta.title).toContain('Acme Studio');
    expect(meta.description).toBe('We make things.');
    expect(meta.twitter?.card).toBe('summary_large_image');
    expect(meta.twitter?.creator).toBe('@acme');
    expect(meta.alternates?.canonical).toContain('/u/meta-brand');
    expect(meta.alternates?.types?.['application/rss+xml']).toBeTruthy();
  });

  it('falls back to the handle and a placeholder image without brand fields', async () => {
    findPublicProfileBySlug.mockResolvedValue(
      brand({
        bannerUrl: undefined,
        description: undefined,
        label: undefined,
        twitterHandle: undefined,
      }),
    );

    const meta = await generateMetadata(
      { params: Promise.resolve({ handle: 'meta-sparse' }) },
      EMPTY_PARENT,
    );

    expect(meta.title).toContain('meta-sparse');
    expect(meta.description).toContain('meta-sparse');
    expect(meta.twitter?.creator).toBeUndefined();
  });

  it('emits a plain profile card when the brand is unknown', async () => {
    findPublicProfileBySlug.mockResolvedValue(null);

    const meta = await generateMetadata(
      { params: Promise.resolve({ handle: 'meta-unknown' }) },
      EMPTY_PARENT,
    );

    expect(meta.twitter?.card).toBe('summary');
    expect(meta.openGraph?.type).toBe('profile');
  });

  it('still emits the plain profile card when the lookup throws', async () => {
    // getPublicBrandBySlug swallows the failure, so the route sees "no brand"
    // rather than an exception and must still answer with usable metadata.
    findPublicProfileBySlug.mockImplementation(() => {
      throw new Error('boom');
    });

    const meta = await generateMetadata(
      { params: Promise.resolve({ handle: 'meta-throws' }) },
      EMPTY_PARENT,
    );

    expect(meta.twitter?.card).toBe('summary');
    expect(meta.description).toContain('meta-throws');
  });

  it('returns the bare fallback when no handle is present', async () => {
    const meta = await generateMetadata(
      {
        params: Promise.resolve({}) as Promise<{ handle: string }>,
      },
      EMPTY_PARENT,
    );

    expect(meta.alternates).toBeUndefined();
    expect(findPublicProfileBySlug).not.toHaveBeenCalled();
  });
});

describe('PublicProfile', () => {
  it('spreads the loaded profile data into the profile content', async () => {
    const element = (await PublicProfile({
      params: Promise.resolve({ handle: 'route-handle' }),
    })) as ReactElement<{
      articles: Article[];
      brand: Brand | null;
      handle: string;
      videos: Video[];
    }>;

    expect(element.props.handle).toBe('route-handle');
    expect(element.props.brand).toMatchObject({ id: 'brand-1' });
    expect(element.props.videos).toBe(VIDEOS);
    expect(element.props.articles).toBe(ARTICLES);
  });
});
