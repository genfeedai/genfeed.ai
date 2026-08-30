import { describe, expect, it } from 'vitest';
import { SavedAd } from './saved-ad.model';

describe('SavedAd', () => {
  it('constructs a durable swipe-file snapshot model', () => {
    const savedAd = new SavedAd({
      brandId: 'brand-1',
      id: 'saved-1',
      imageUrls: ['https://files.example/snapshot.jpg'],
      sourceAdId: 'source-1',
    });

    expect(savedAd.id).toBe('saved-1');
    expect(savedAd.brandId).toBe('brand-1');
    expect(savedAd.imageUrls).toEqual(['https://files.example/snapshot.jpg']);
  });
});
