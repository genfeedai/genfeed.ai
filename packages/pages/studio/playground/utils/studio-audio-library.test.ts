import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { describe, expect, it, vi } from 'vitest';
import { loadStudioAudioLibrary } from './studio-audio-library';

function asset(
  id: string,
  category = IngredientCategory.AUDIO,
  changes: Partial<ConstructorParameters<typeof Ingredient>[0]> = {},
) {
  return new Ingredient({
    id,
    category,
    brandId: 'brand-a',
    organizationId: 'org-a',
    status: IngredientStatus.UPLOADED,
    s3Key: `audio/${id}.mp3`,
    ...changes,
  });
}

describe('ingredient-backed Studio audio Library', () => {
  it('loads recorded AUDIO, generated VOICE and MUSIC with actual ingredient IDs', async () => {
    const findAllPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [asset('recording')] })
      .mockResolvedValueOnce({
        items: [
          asset('elevenlabs-output', IngredientCategory.VOICE, {
            status: IngredientStatus.GENERATED,
            modelUsed: 'eleven_multilingual_v2',
          }),
          asset('recording'),
        ],
      })
      .mockResolvedValueOnce({
        items: [asset('music', IngredientCategory.MUSIC)],
      });
    const signal = new AbortController().signal;
    const items = await loadStudioAudioLibrary(
      { findAllPage },
      'brand-a',
      'org-a',
      signal,
    );
    expect(items.map((item) => item.id)).toEqual([
      'recording',
      'elevenlabs-output',
      'music',
    ]);
    expect(items.every((item) => item.thumbnailUrl === undefined)).toBe(true);
    expect(findAllPage.mock.calls.map(([query]) => query.categories)).toEqual([
      [IngredientCategory.AUDIO],
      [IngredientCategory.VOICE],
      [IngredientCategory.MUSIC],
    ]);
    for (const [query, usedSignal] of findAllPage.mock.calls) {
      expect(query).toMatchObject({ brandId: 'brand-a', limit: 24, page: 1 });
      expect(usedSignal).toBe(signal);
    }
  });
  it('rejects foreign, deleted, pending, non-audio and unstored rows', async () => {
    const findAllPage = vi.fn().mockResolvedValue({
      items: [
        asset('foreign-brand', IngredientCategory.AUDIO, {
          brandId: 'brand-b',
        }),
        asset('foreign-org', IngredientCategory.AUDIO, {
          organizationId: 'org-b',
        }),
        asset('deleted', IngredientCategory.AUDIO, { isDeleted: true }),
        asset('pending', IngredientCategory.AUDIO, {
          status: IngredientStatus.PROCESSING,
        }),
        asset('image', IngredientCategory.IMAGE),
        asset('url-only', IngredientCategory.AUDIO, {
          s3Key: null,
          cdnUrl: 'https://example.test/a.mp3',
        }),
      ],
    });
    expect(
      await loadStudioAudioLibrary(
        { findAllPage },
        'brand-a',
        'org-a',
        new AbortController().signal,
      ),
    ).toEqual([]);
  });
  it('publishes no partial set when one category fails and honors cancellation', async () => {
    const findAllPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [asset('not-published')] })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [] });
    await expect(
      loadStudioAudioLibrary(
        { findAllPage },
        'brand-a',
        'org-a',
        new AbortController().signal,
      ),
    ).rejects.toThrow('offline');
    findAllPage.mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadStudioAudioLibrary(
        { findAllPage },
        'brand-a',
        'org-a',
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(findAllPage).not.toHaveBeenCalled();
  });
});
