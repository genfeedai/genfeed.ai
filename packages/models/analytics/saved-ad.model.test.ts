import { describe, expect, it } from 'vitest';
import { SavedAd } from './saved-ad.model';

describe('SavedAd domain model', () => {
  it('retains the normalized source identity', () => {
    const savedAd = new SavedAd({
      id: 'saved-1',
      platform: 'meta',
      sourceAdId: 'source-1',
    });

    expect(savedAd.platform).toBe('meta');
    expect(savedAd.sourceAdId).toBe('source-1');
  });
});
