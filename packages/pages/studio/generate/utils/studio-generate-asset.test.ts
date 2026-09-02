import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioGenerateJob } from '@pages/studio/generate/types';
import { describe, expect, it } from 'vitest';
import {
  filterStudioGenerateJobs,
  mergeStudioGenerateJobs,
  resolveJsonApiIngredientId,
  resolveStudioAssetUrl,
  resolveStudioTypeFromCategory,
  STUDIO_GENERATE_CATEGORIES,
  toStudioGenerateJob,
} from './studio-generate-asset';

function buildIngredient(overrides: Partial<IIngredient> = {}): IIngredient {
  return {
    category: IngredientCategory.IMAGE,
    createdAt: '2026-08-20T10:00:00.000Z',
    id: 'ing-1',
    isDeleted: false,
    status: IngredientStatus.GENERATED,
    updatedAt: '2026-08-20T10:00:00.000Z',
    ...overrides,
  } as IIngredient;
}

function buildJob(
  overrides: Partial<StudioGenerateJob> = {},
): StudioGenerateJob {
  return {
    createdAt: 1,
    id: 'job-1',
    prompt: 'a prompt',
    status: IngredientStatus.GENERATED,
    type: 'image',
    ...overrides,
  };
}

describe('resolveStudioAssetUrl', () => {
  it('prefers the CDN url, then the ingredient url, then the thumbnail', () => {
    expect(
      resolveStudioAssetUrl({
        cdnUrl: 'cdn',
        ingredientUrl: 'ingredient',
        thumbnailUrl: 'thumb',
      }),
    ).toBe('cdn');
    expect(
      resolveStudioAssetUrl({
        cdnUrl: null,
        ingredientUrl: 'ingredient',
        thumbnailUrl: 'thumb',
      }),
    ).toBe('ingredient');
    expect(resolveStudioAssetUrl({ cdnUrl: null, thumbnailUrl: 'thumb' })).toBe(
      'thumb',
    );
  });

  it('returns undefined when nothing is playable yet', () => {
    expect(resolveStudioAssetUrl(null)).toBeUndefined();
    expect(resolveStudioAssetUrl({ cdnUrl: null })).toBeUndefined();
  });
});

describe('resolveStudioTypeFromCategory', () => {
  it('maps every Studio category back to its composer type', () => {
    expect(resolveStudioTypeFromCategory(IngredientCategory.IMAGE)).toBe(
      'image',
    );
    expect(resolveStudioTypeFromCategory(IngredientCategory.VIDEO)).toBe(
      'video',
    );
    expect(resolveStudioTypeFromCategory(IngredientCategory.MUSIC)).toBe(
      'music',
    );
    expect(resolveStudioTypeFromCategory(IngredientCategory.AVATAR)).toBe(
      'avatar',
    );
    expect(resolveStudioTypeFromCategory(IngredientCategory.VOICE)).toBe(
      'voice',
    );
  });

  it('returns null for a category the playground does not generate', () => {
    expect(resolveStudioTypeFromCategory(IngredientCategory.SOURCE)).toBeNull();
    expect(resolveStudioTypeFromCategory(undefined)).toBeNull();
  });

  it('exposes exactly the five generated categories', () => {
    expect(STUDIO_GENERATE_CATEGORIES).toEqual([
      IngredientCategory.IMAGE,
      IngredientCategory.VIDEO,
      IngredientCategory.MUSIC,
      IngredientCategory.AVATAR,
      IngredientCategory.VOICE,
    ]);
  });
});

describe('toStudioGenerateJob', () => {
  it('projects a stored ingredient onto the live job shape', () => {
    const ingredient = buildIngredient({
      cdnUrl: 'https://cdn/img.png',
      metadata: {
        height: 1350,
        model: 'flux-schnell',
        width: 1080,
      } as IIngredient['metadata'],
      promptText: 'a red sofa',
    });
    const job = toStudioGenerateJob(ingredient);

    expect(job).toEqual({
      createdAt: new Date('2026-08-20T10:00:00.000Z').getTime(),
      height: 1350,
      id: 'ing-1',
      ingredient,
      ingredientId: 'ing-1',
      modelKey: 'flux-schnell',
      prompt: 'a red sofa',
      status: IngredientStatus.GENERATED,
      type: 'image',
      url: 'https://cdn/img.png',
      width: 1080,
    });
  });

  it('preserves a failed status so the grid can render the failure card', () => {
    expect(
      toStudioGenerateJob(buildIngredient({ status: IngredientStatus.FAILED }))
        ?.status,
    ).toBe(IngredientStatus.FAILED);
  });

  it('uses persisted dimensions instead of model getter defaults', () => {
    const ingredient = buildIngredient({ height: 720, width: 1280 });
    Object.defineProperties(ingredient, {
      metadataHeight: { get: () => 1920 },
      metadataWidth: { get: () => 1080 },
    });

    expect(toStudioGenerateJob(ingredient)).toMatchObject({
      height: 720,
      width: 1280,
    });
  });

  it('drops an ingredient the playground does not own', () => {
    expect(
      toStudioGenerateJob(
        buildIngredient({ category: IngredientCategory.SOURCE }),
      ),
    ).toBeNull();
  });
});

describe('mergeStudioGenerateJobs', () => {
  it('keeps a socket completion ahead of a stale processing response', () => {
    const liveIngredient = buildIngredient({ id: 'a' });
    const merged = mergeStudioGenerateJobs(
      [
        buildJob({
          id: 'a',
          ingredient: liveIngredient,
          status: IngredientStatus.GENERATED,
          url: 'ready',
        }),
      ],
      [
        buildJob({
          id: 'a',
          status: IngredientStatus.PROCESSING,
        }),
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe(IngredientStatus.GENERATED);
    expect(merged[0].url).toBe('ready');
    expect(merged[0].ingredient).toBe(liveIngredient);
  });

  it('lets refreshed persisted data replace a completed live copy', () => {
    const liveIngredient = buildIngredient({ id: 'a', isFavorite: false });
    const refreshedIngredient = buildIngredient({
      id: 'a',
      isFavorite: true,
      status: IngredientStatus.VALIDATED,
    });
    const merged = mergeStudioGenerateJobs(
      [buildJob({ id: 'a', ingredient: liveIngredient })],
      [
        buildJob({
          id: 'a',
          ingredient: refreshedIngredient,
          status: IngredientStatus.VALIDATED,
        }),
      ],
    );

    expect(merged[0]?.status).toBe(IngredientStatus.VALIDATED);
    expect(merged[0]?.ingredient).toBe(refreshedIngredient);
  });

  it('keeps the client run id and recipe when the gallery hydrates the row', () => {
    const storedIngredient = buildIngredient({ id: 'a' });
    const merged = mergeStudioGenerateJobs(
      [
        buildJob({
          id: 'a',
          recipe: {
            blacklist: [],
            brandingMode: 'brand',
            isAudioEnabled: false,
            outputs: 4,
            references: [],
            style: 'editorial',
            tags: [],
            text: 'Enriched',
            type: 'image',
          },
          runId: 'run-1',
          status: IngredientStatus.PROCESSING,
        }),
      ],
      [
        buildJob({
          id: 'a',
          ingredient: storedIngredient,
          prompt: 'Raw box',
          status: IngredientStatus.PROCESSING,
        }),
      ],
    );

    expect(merged[0]).toMatchObject({
      ingredient: storedIngredient,
      recipe: expect.objectContaining({ text: 'Enriched' }),
      runId: 'run-1',
    });
  });

  it('sorts newest first across both sources', () => {
    const merged = mergeStudioGenerateJobs(
      [buildJob({ createdAt: 30, id: 'live' })],
      [
        buildJob({ createdAt: 10, id: 'old' }),
        buildJob({ createdAt: 20, id: 'mid' }),
      ],
    );

    expect(merged.map((job) => job.id)).toEqual(['live', 'mid', 'old']);
  });
});

describe('filterStudioGenerateJobs', () => {
  const jobs = [
    buildJob({ id: 'a', prompt: 'Red sofa', type: 'image' }),
    buildJob({ id: 'b', prompt: 'Blue car driving', type: 'video' }),
    buildJob({ id: 'c', prompt: 'Lo-fi beat', type: 'music' }),
  ];

  it('returns everything for the All pill', () => {
    expect(filterStudioGenerateJobs(jobs, { type: 'all' })).toHaveLength(3);
    expect(filterStudioGenerateJobs(jobs, {})).toHaveLength(3);
  });

  it('narrows to one type', () => {
    expect(
      filterStudioGenerateJobs(jobs, { type: 'video' }).map((job) => job.id),
    ).toEqual(['b']);
  });

  it('searches prompts case-insensitively', () => {
    expect(
      filterStudioGenerateJobs(jobs, { search: '  SOFA ' }).map(
        (job) => job.id,
      ),
    ).toEqual(['a']);
  });

  it('combines the type pill with the search field', () => {
    expect(
      filterStudioGenerateJobs(jobs, { search: 'sofa', type: 'video' }),
    ).toEqual([]);
  });
});

describe('resolveJsonApiIngredientId', () => {
  it('reads the id out of a JSON:API single-resource document', () => {
    expect(
      resolveJsonApiIngredientId({
        data: {
          attributes: { status: 'PROCESSING' },
          id: 'ing-9',
          type: 'ingredients',
        },
      }),
    ).toBe('ing-9');
  });

  it('accepts a bare ingredient object and a numeric id', () => {
    expect(resolveJsonApiIngredientId({ id: 'ing-3' })).toBe('ing-3');
    expect(resolveJsonApiIngredientId({ data: { id: 7 } })).toBe('7');
  });

  it.each([undefined, null, {}, { data: {} }, { data: { id: '' } }])(
    'throws rather than tracking a job that can never complete for %p',
    (response) => {
      expect(() => resolveJsonApiIngredientId(response)).toThrow(
        'Avatar generation response carried no ingredient id',
      );
    },
  );
});
