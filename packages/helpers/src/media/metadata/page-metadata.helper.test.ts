import { describe, expect, it, vi } from 'vitest';

vi.mock('./metadata.helper', () => ({
  metadata: {
    description: 'The AI content studio.',
    name: 'Genfeed AI',
    url: 'https://genfeed.ai',
  },
}));

import {
  createDynamicPageMetadata,
  createPageMetadata,
  createPageMetadataWithCanonical,
  createPageMetadataWithDescription,
} from '@helpers/media/metadata/page-metadata.helper';

function createMockParent(images: string[] = []) {
  return Promise.resolve({
    openGraph: { images },
  });
}

describe('page-metadata.helper', () => {
  describe('createPageMetadata', () => {
    it('should return a function', () => {
      const generate = createPageMetadata('Dashboard');
      expect(typeof generate).toBe('function');
    });

    it('should generate metadata with correct title', async () => {
      const generate = createPageMetadata('Dashboard');
      const result = await generate({}, createMockParent() as never);
      expect(result.title).toBe('Dashboard | Genfeed AI');
      expect(result.openGraph?.title).toBe('Dashboard | Genfeed AI');
      expect(result.twitter?.title).toBe('Dashboard | Genfeed AI');
    });

    it('should pass through parent openGraph images', async () => {
      const parentImages = ['https://example.com/og.jpg'];
      const generate = createPageMetadata('Home');
      const result = await generate(
        {},
        createMockParent(parentImages) as never,
      );
      expect(result.openGraph?.images).toEqual(parentImages);
    });

    it('should include twitter images from parent', async () => {
      const parentImages = ['https://example.com/tw.jpg'];
      const generate = createPageMetadata('Home');
      const result = await generate(
        {},
        createMockParent(parentImages) as never,
      );
      expect(result.twitter?.images).toEqual(parentImages);
    });

    it('should handle empty parent images', async () => {
      const generate = createPageMetadata('About');
      const parent = Promise.resolve({ openGraph: {} });
      const result = await generate({}, parent as never);
      expect(result.openGraph?.images).toEqual([]);
    });

    it('should emit a canonical URL and openGraph url when given a path', async () => {
      const generate = createPageMetadata('Dashboard', '/dashboard');
      const result = await generate({}, createMockParent() as never);
      expect(result.alternates?.canonical).toBe('https://genfeed.ai/dashboard');
      expect(result.openGraph?.url).toBe('https://genfeed.ai/dashboard');
    });

    it('should omit canonical and openGraph url when no path is given', async () => {
      const generate = createPageMetadata('Dashboard');
      const result = await generate({}, createMockParent() as never);
      expect(result.alternates?.canonical).toBeUndefined();
      expect(result.openGraph?.url).toBeUndefined();
    });
  });

  describe('createDynamicPageMetadata', () => {
    it('should return a function', () => {
      const generate = createDynamicPageMetadata('slug', (v) => v);
      expect(typeof generate).toBe('function');
    });

    it('should use formatter to build title from params', async () => {
      const generate = createDynamicPageMetadata(
        'slug',
        (value: string) => `Article: ${value}`,
      );
      const props = { params: Promise.resolve({ slug: 'hello-world' }) };
      const result = await generate(props, createMockParent() as never);
      expect(result.title).toBe('Article: hello-world | Genfeed AI');
      expect(result.openGraph?.title).toBe('Article: hello-world | Genfeed AI');
      expect(result.twitter?.title).toBe('Article: hello-world | Genfeed AI');
    });

    it('should pass parent openGraph images', async () => {
      const images = ['https://example.com/img.jpg'];
      const generate = createDynamicPageMetadata('id', (v: string) => v);
      const props = { params: Promise.resolve({ id: 'test' }) };
      const result = await generate(props, createMockParent(images) as never);
      expect(result.openGraph?.images).toEqual(images);
    });

    it('should build a canonical URL from the resolved param', async () => {
      const generate = createDynamicPageMetadata(
        'slug',
        (value: string) => `Article: ${value}`,
        (value: string) => `/articles/${value}`,
      );
      const props = { params: Promise.resolve({ slug: 'hello-world' }) };
      const result = await generate(props, createMockParent() as never);
      expect(result.alternates?.canonical).toBe(
        'https://genfeed.ai/articles/hello-world',
      );
      expect(result.openGraph?.url).toBe(
        'https://genfeed.ai/articles/hello-world',
      );
    });

    it('should omit canonical when no path builder is given', async () => {
      const generate = createDynamicPageMetadata('slug', (v: string) => v);
      const props = { params: Promise.resolve({ slug: 'test' }) };
      const result = await generate(props, createMockParent() as never);
      expect(result.alternates?.canonical).toBeUndefined();
      expect(result.openGraph?.url).toBeUndefined();
    });
  });

  describe('createPageMetadataWithDescription', () => {
    it('should return a function', () => {
      const generate = createPageMetadataWithDescription(
        'Pricing',
        'Our pricing plans',
      );
      expect(typeof generate).toBe('function');
    });

    it('should include description in metadata', async () => {
      const generate = createPageMetadataWithDescription(
        'Pricing',
        'Affordable plans for everyone',
      );
      const result = await generate({}, createMockParent() as never);
      expect(result.description).toBe('Affordable plans for everyone');
      expect(result.title).toBe('Pricing | Genfeed AI');
    });

    it('should include description in openGraph', async () => {
      const generate = createPageMetadataWithDescription(
        'Features',
        'All our features',
      );
      const result = await generate({}, createMockParent() as never);
      expect(result.openGraph?.description).toBe('All our features');
      expect(result.openGraph?.title).toBe('Features | Genfeed AI');
    });

    it('should include description in twitter', async () => {
      const generate = createPageMetadataWithDescription('Blog', 'Latest news');
      const result = await generate({}, createMockParent() as never);
      expect(result.twitter?.description).toBe('Latest news');
      expect(result.twitter?.title).toBe('Blog | Genfeed AI');
    });

    it('should emit a canonical URL and openGraph url when given a path', async () => {
      const generate = createPageMetadataWithDescription(
        'Pricing',
        'Affordable plans',
        '/pricing',
      );
      const result = await generate({}, createMockParent() as never);
      expect(result.alternates?.canonical).toBe('https://genfeed.ai/pricing');
      expect(result.openGraph?.url).toBe('https://genfeed.ai/pricing');
    });
  });

  describe('createPageMetadataWithCanonical', () => {
    it('should return a function', () => {
      const generate = createPageMetadataWithCanonical(
        'FAQ',
        'Frequently asked questions',
        '/faq',
      );
      expect(typeof generate).toBe('function');
    });

    it('should include canonical URL in alternates', async () => {
      const generate = createPageMetadataWithCanonical(
        'FAQ',
        'Questions',
        '/faq',
      );
      const result = await generate({}, createMockParent() as never);
      expect(result.alternates?.canonical).toBe('https://genfeed.ai/faq');
    });

    it('should include openGraph url', async () => {
      const generate = createPageMetadataWithCanonical(
        'Terms',
        'Our terms',
        '/terms',
      );
      const result = await generate({}, createMockParent() as never);
      expect(result.openGraph?.url).toBe('https://genfeed.ai/terms');
    });

    it('should include all metadata fields', async () => {
      const generate = createPageMetadataWithCanonical(
        'Privacy',
        'Privacy policy',
        '/privacy',
      );
      const result = await generate({}, createMockParent() as never);
      expect(result.title).toBe('Privacy | Genfeed AI');
      expect(result.description).toBe('Privacy policy');
      expect(result.openGraph?.description).toBe('Privacy policy');
      expect(result.twitter?.description).toBe('Privacy policy');
    });
  });

  describe('canonical path normalization', () => {
    it('should prefix a missing leading slash', async () => {
      const generate = createPageMetadataWithCanonical(
        'FAQ',
        'Questions',
        'faq',
      );
      const result = await generate({}, createMockParent() as never);
      expect(result.alternates?.canonical).toBe('https://genfeed.ai/faq');
    });

    it('should treat an empty path as the site root', async () => {
      const generate = createPageMetadataWithCanonical(
        'Home',
        'The studio',
        '',
      );
      const result = await generate({}, createMockParent() as never);
      expect(result.alternates?.canonical).toBe('https://genfeed.ai');
      expect(result.openGraph?.url).toBe('https://genfeed.ai');
    });

    it('should strip a trailing slash from a nested path', async () => {
      const generate = createPageMetadataWithCanonical(
        'Articles',
        'All articles',
        '/articles/',
      );
      const result = await generate({}, createMockParent() as never);
      expect(result.alternates?.canonical).toBe('https://genfeed.ai/articles');
    });
  });

  describe('open graph completeness guarantees', () => {
    // Next.js shallow-replaces the root layout's `openGraph` and `twitter`
    // objects, so every page-level builder has to restate these itself or the
    // page ships without them. Ahrefs reports "Open Graph tags incomplete"
    // when any of og:title / og:description / og:image / og:url is missing.
    const builders = [
      {
        generate: createPageMetadata('Dashboard', '/dashboard'),
        name: 'createPageMetadata',
      },
      {
        generate: createPageMetadataWithDescription(
          'Pricing',
          'Affordable plans',
          '/pricing',
        ),
        name: 'createPageMetadataWithDescription',
      },
      {
        generate: createPageMetadataWithCanonical('FAQ', 'Questions', '/faq'),
        name: 'createPageMetadataWithCanonical',
      },
    ];

    for (const { generate, name } of builders) {
      it(`should set openGraph type for ${name}`, async () => {
        const result = await generate({}, createMockParent() as never);
        expect(result.openGraph?.type).toBe('website');
      });

      it(`should set openGraph siteName for ${name}`, async () => {
        const result = await generate({}, createMockParent() as never);
        expect(result.openGraph?.siteName).toBe('Genfeed AI');
      });

      it(`should set twitter card for ${name}`, async () => {
        const result = await generate({}, createMockParent() as never);
        expect(result.twitter?.card).toBe('summary_large_image');
      });

      it(`should always emit an openGraph description for ${name}`, async () => {
        const result = await generate({}, createMockParent() as never);
        expect(result.openGraph?.description).toBeTruthy();
      });
    }

    it('should set the guarantees on createDynamicPageMetadata too', async () => {
      const generate = createDynamicPageMetadata(
        'slug',
        (value: string) => value,
        (value: string) => `/articles/${value}`,
      );
      const props = { params: Promise.resolve({ slug: 'hello' }) };
      const result = await generate(props, createMockParent() as never);
      expect(result.openGraph?.type).toBe('website');
      expect(result.openGraph?.siteName).toBe('Genfeed AI');
      expect(result.twitter?.card).toBe('summary_large_image');
      expect(result.openGraph?.description).toBeTruthy();
    });

    it('should fall back to the site description when none is given', async () => {
      const generate = createPageMetadata('Dashboard', '/dashboard');
      const result = await generate({}, createMockParent() as never);
      expect(result.openGraph?.description).toBe('The AI content studio.');
      expect(result.twitter?.description).toBe('The AI content studio.');
    });

    it('should not set a page description when none is given', async () => {
      const generate = createPageMetadata('Dashboard', '/dashboard');
      const result = await generate({}, createMockParent() as never);
      expect(result.description).toBeUndefined();
    });

    it('should prefer an explicit description over the site fallback', async () => {
      const generate = createPageMetadataWithDescription(
        'Pricing',
        'Affordable plans',
        '/pricing',
      );
      const result = await generate({}, createMockParent() as never);
      expect(result.openGraph?.description).toBe('Affordable plans');
      expect(result.twitter?.description).toBe('Affordable plans');
    });
  });
});
