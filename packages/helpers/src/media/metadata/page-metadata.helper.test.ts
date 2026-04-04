import { describe, expect, it, vi } from 'vitest';

vi.mock('./metadata.helper', () => ({
  metadata: {
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
    });

    it('should pass parent openGraph images', async () => {
      const images = ['https://example.com/img.jpg'];
      const generate = createDynamicPageMetadata('id', (v: string) => v);
      const props = { params: Promise.resolve({ id: 'test' }) };
      const result = await generate(props, createMockParent(images) as never);
      expect(result.openGraph?.images).toEqual(images);
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
});
