import { describe, expect, it } from 'vitest';
import { canOptimizeImageSource } from './can-optimize-image-source';

describe('canOptimizeImageSource', () => {
  it.each([
    '/images/default-card.webp',
    'https://cdn.genfeed.ai/image.webp',
    'https://assets.cloudfront.net/image.webp',
    'https://bucket.s3.amazonaws.com/image.webp',
    'https://tenant.supabase.co/storage/v1/object/public/image.webp',
    'https://images.unsplash.com/photo-1',
  ])('allows optimizer-configured sources: %s', (source) => {
    expect(canOptimizeImageSource(source)).toBe(true);
  });

  it.each([
    'blob:https://app.genfeed.ai/object-id',
    'data:image/png;base64,abc',
    'https://customer-cdn.example.com/image.webp',
    'https://genfeed.ai/image.webp',
    '//customer-cdn.example.com/image.webp',
    'not a URL',
  ])('bypasses unsupported or non-network sources: %s', (source) => {
    expect(canOptimizeImageSource(source)).toBe(false);
  });
});
