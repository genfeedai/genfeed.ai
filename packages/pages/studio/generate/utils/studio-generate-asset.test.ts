import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerateJob,
  StudioGenerateReferenceRole,
} from '@pages/studio/generate/types';
import { describe, expect, it } from 'vitest';
import {
  canUseStudioJobAsReference,
  filterStudioGenerateJobs,
  mergeStudioGenerateJobs,
  replaceStudioContentReference,
  resolveJsonApiIngredientId,
  resolveStudioAssetFacts,
  resolveStudioAssetUrl,
  resolveStudioTypeFromCategory,
  STUDIO_GENERATE_CATEGORIES,
  studioJobToContentMention,
  studioReferenceRoleForJob,
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

  it('links a transformation to the ingredient it was produced from', () => {
    expect(
      toStudioGenerateJob(
        buildIngredient({
          category: IngredientCategory.VIDEO,
          parentId: 'source-1',
        }),
      )?.parentId,
    ).toBe('source-1');
    expect(toStudioGenerateJob(buildIngredient())?.parentId).toBeUndefined();
  });

  it('renders a GIF made from a Generate video as an image card', () => {
    expect(
      toStudioGenerateJob(buildIngredient({ category: IngredientCategory.GIF }))
        ?.type,
    ).toBe('image');
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

describe('studio gallery references', () => {
  it('lists a ready generated image for the reference picker', () => {
    const job = toStudioGenerateJob(
      buildIngredient({
        brandId: 'brand-1',
        cdnUrl: 'https://cdn/apple.png',
        promptText: 'a green apple',
      }),
    );

    expect(job && studioJobToContentMention(job)).toEqual({
      brandId: 'brand-1',
      contentTitle: 'a green apple',
      contentType: 'image',
      id: 'ing-1',
      thumbnailUrl: 'https://cdn/apple.png',
    });
  });

  it('lists a ready video separately from images', () => {
    const job = toStudioGenerateJob(
      buildIngredient({
        category: IngredientCategory.VIDEO,
        cdnUrl: 'https://cdn/clip.mp4',
        promptText: 'a walk cycle',
      }),
    );

    expect(job && studioJobToContentMention(job)?.contentType).toBe('video');
    expect(job && studioReferenceRoleForJob(job, 'video')).toBe(
      'videoReference',
    );
  });

  it('keeps the open composer type when an image is used on a video prompt', () => {
    const job = buildJob({
      ingredientId: 'ing-1',
      type: 'image',
      url: 'https://cdn/apple.png',
    });

    expect(studioReferenceRoleForJob(job, 'video')).toBe('startFrame');
    expect(studioReferenceRoleForJob(job, 'image')).toBe('reference');
    expect(studioReferenceRoleForJob(job, 'image-edit')).toBe('editSource');
    expect(studioJobToContentMention(job)?.id).toBe('ing-1');
  });

  it('hides use-as-reference when the open composer cannot accept the asset', () => {
    const image = buildJob({ type: 'image' });
    const video = buildJob({ type: 'video' });
    const supported = {
      isStartFrameSupported: true,
      isVideoReferenceSupported: true,
    };

    expect(studioReferenceRoleForJob(video, 'image')).toBeNull();
    expect(canUseStudioJobAsReference(video, 'image', supported)).toBe(false);
    expect(canUseStudioJobAsReference(image, 'video', supported)).toBe(true);
    expect(
      canUseStudioJobAsReference(video, 'video', {
        ...supported,
        isVideoReferenceSupported: false,
      }),
    ).toBe(false);
    expect(
      canUseStudioJobAsReference(image, 'video', {
        ...supported,
        isStartFrameSupported: false,
      }),
    ).toBe(false);
  });

  it('replaces the stored role when the same asset is attached again', () => {
    const item = { id: 'ing-1' };
    const other = { id: 'ing-2' };
    const reference = (
      id: { id: string },
      role: StudioGenerateReferenceRole,
    ): { item: { id: string }; role: StudioGenerateReferenceRole } => ({
      item: id,
      role,
    });

    expect(
      replaceStudioContentReference(
        [reference(item, 'reference')],
        reference(item, 'startFrame'),
        true,
      ),
    ).toEqual([reference(item, 'startFrame')]);

    const sameRole = [reference(item, 'startFrame')];
    expect(
      replaceStudioContentReference(
        sameRole,
        reference(item, 'startFrame'),
        true,
      ),
    ).toBe(sameRole);

    expect(
      replaceStudioContentReference(
        [reference(other, 'endFrame'), reference(item, 'reference')],
        reference(item, 'startFrame'),
        true,
      ),
    ).toEqual([reference(other, 'endFrame'), reference(item, 'startFrame')]);

    expect(
      replaceStudioContentReference(
        [reference(other, 'startFrame'), reference(item, 'reference')],
        reference(item, 'startFrame'),
        false,
      ),
    ).toEqual([reference(item, 'startFrame')]);
  });

  it('skips assets that are still generating or have no preview', () => {
    expect(
      studioJobToContentMention(
        buildJob({
          status: IngredientStatus.PROCESSING,
          url: 'https://cdn/x.png',
        }),
      ),
    ).toBeNull();
    expect(
      studioJobToContentMention(buildJob({ type: 'image', url: undefined })),
    ).toBeNull();
    expect(
      studioJobToContentMention(
        buildJob({ type: 'music', url: 'https://cdn/song.mp3' }),
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

describe('resolveStudioAssetFacts', () => {
  it('prefers the submitted recipe over persisted metadata', () => {
    const facts = resolveStudioAssetFacts(
      buildJob({
        createdAt: Date.UTC(2026, 7, 21, 9),
        ingredient: buildIngredient({
          brand: { label: 'Northstar' } as IIngredient['brand'],
          metadata: {
            duration: 4,
            modelLabel: 'Veo 3',
          } as IIngredient['metadata'],
        }),
        recipe: {
          aspectRatio: '9:16',
          blacklist: [],
          duration: 8,
          isAudioEnabled: false,
          outputs: 1,
          references: [],
          tags: [],
          text: 'A coastline',
          type: 'video',
        },
        type: 'video',
      }),
    );

    expect(facts).toEqual({
      aspectRatio: '9:16',
      brandLabel: 'Northstar',
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      durationSeconds: 8,
      modelLabel: 'Veo 3',
    });
  });

  it('falls back to live job fields and omits what it does not know', () => {
    const facts = resolveStudioAssetFacts(
      buildJob({
        createdAt: 0,
        height: 1024,
        modelKey: 'flux-dev',
        width: 768,
      }),
    );

    expect(facts).toEqual({
      aspectRatio: '3:4',
      brandLabel: undefined,
      createdAt: undefined,
      durationSeconds: undefined,
      modelLabel: 'flux-dev',
    });
  });

  it('never reports the Ingredient model getter defaults as facts', () => {
    // The hydrated model answers 8s and 1080×1920 when metadata is missing.
    const ingredient = Object.defineProperties(buildIngredient(), {
      aspectRatio: { get: () => '9:16' },
      metadataDuration: { get: () => 8 },
      metadataHeight: { get: () => 1920 },
      metadataWidth: { get: () => 1080 },
    });

    const facts = resolveStudioAssetFacts(
      buildJob({ ingredient, type: 'image' }),
    );

    expect(facts.aspectRatio).toBeUndefined();
    expect(facts.durationSeconds).toBeUndefined();
  });
});

it('deduplicates failed stored/socket observations while retaining run recipe and a terminal result over stale pending', () => {
  const recipe = {
    text: 'Saved submission',
    blacklist: [],
    tags: [],
    references: [],
    outputs: 1,
    isAudioEnabled: false,
    modelKey: 'model',
    type: 'video' as const,
  };
  const failed = {
    id: 'saved',
    ingredientId: 'saved',
    createdAt: 1,
    prompt: 'Saved',
    type: 'video' as const,
    status: IngredientStatus.FAILED,
    recipe,
    runId: 'run',
  };
  const stored = { ...failed, recipe: undefined, runId: undefined };
  const once = mergeStudioGenerateJobs([failed, failed], [stored]);
  expect(once).toHaveLength(1);
  expect(once[0]).toMatchObject({ recipe, runId: 'run' });
  expect(
    mergeStudioGenerateJobs(once, [
      { ...stored, status: IngredientStatus.PROCESSING },
    ])[0].status,
  ).toBe(IngredientStatus.FAILED);
});
