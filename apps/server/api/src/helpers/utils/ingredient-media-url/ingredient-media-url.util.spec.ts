import { describe, expect, it } from 'vitest';
import { resolveIngredientMediaUrl } from './ingredient-media-url.util';

const CDN = 'https://cdn.genfeed.ai';

describe('resolveIngredientMediaUrl', () => {
  it('prefers cdnUrl over s3Key and metadata.result', () => {
    expect(
      resolveIngredientMediaUrl(
        {
          cdnUrl: 'https://cdn.genfeed.ai/ingredients/videos/abc.mp4',
          metadata: { result: 'https://replicate.delivery/expired.mp4' },
          s3Key: 'ingredients/videos/abc.mp4',
        },
        CDN,
      ),
    ).toBe('https://cdn.genfeed.ai/ingredients/videos/abc.mp4');
  });

  it('builds a public URL from s3Key when cdnUrl is missing', () => {
    expect(
      resolveIngredientMediaUrl({ s3Key: 'ingredients/videos/abc.mp4' }, CDN),
    ).toBe('https://cdn.genfeed.ai/ingredients/videos/abc.mp4');
  });

  it('falls back to metadata.result for provider-hosted files', () => {
    expect(
      resolveIngredientMediaUrl(
        { metadata: { result: 'https://replicate.delivery/clip.mp4' } },
        CDN,
      ),
    ).toBe('https://replicate.delivery/clip.mp4');
  });

  it('returns undefined when no playable URL exists', () => {
    expect(resolveIngredientMediaUrl({}, CDN)).toBeUndefined();
    expect(
      resolveIngredientMediaUrl({ metadata: 'meta-id-only' }, CDN),
    ).toBeUndefined();
  });

  it('rewrites files-host and /local/ disk paths onto the public CDN', () => {
    expect(
      resolveIngredientMediaUrl(
        {
          cdnUrl:
            'https://files.genfeed.localhost/local/ingredients/videos/abc.mp4',
        },
        'https://files.genfeed.localhost',
      ),
    ).toBe('https://staging-cdn.genfeed.ai/ingredients/videos/abc.mp4');

    expect(
      resolveIngredientMediaUrl(
        { s3Key: 'local/ingredients/videos/abc.mp4' },
        CDN,
      ),
    ).toBe('https://cdn.genfeed.ai/ingredients/videos/abc.mp4');
  });
});
