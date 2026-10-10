import { IngredientStatus } from '@genfeedai/contracts';
import type { StudioPlaygroundJob } from '@pages/studio/playground/types';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  readStudioPlaygroundSessionJobs,
  STUDIO_PLAYGROUND_SESSION_KEY,
  writeStudioPlaygroundSessionJobs,
} from './studio-playground-session';

const job: StudioPlaygroundJob = {
  createdAt: 42,
  height: 1024,
  id: 'img-1',
  ingredientId: 'img-1',
  modelKey: 'flux-dev',
  prompt: 'A founder at a desk',
  recipe: {
    blacklist: [],
    brandingMode: 'brand',
    isAudioEnabled: false,
    outputs: 4,
    references: [],
    style: 'editorial',
    tags: [],
    text: 'A founder at a desk',
    type: 'image',
  },
  runId: 'run-1',
  status: IngredientStatus.PROCESSING,
  type: 'image',
  width: 1024,
};

describe('studio generate session jobs', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips in-flight jobs without the hydrated ingredient', () => {
    writeStudioPlaygroundSessionJobs('brand-1', [
      {
        ...job,
        ingredient: { id: 'img-1' } as StudioPlaygroundJob['ingredient'],
      },
    ]);

    expect(readStudioPlaygroundSessionJobs('brand-1')).toEqual([
      expect.objectContaining({
        id: 'img-1',
        recipe: expect.objectContaining({
          brandingMode: 'brand',
          style: 'editorial',
          text: 'A founder at a desk',
        }),
        runId: 'run-1',
        status: IngredientStatus.PROCESSING,
      }),
    ]);
    expect(readStudioPlaygroundSessionJobs('brand-1')[0]).not.toHaveProperty(
      'ingredient',
    );
    expect(
      window.sessionStorage.getItem(STUDIO_PLAYGROUND_SESSION_KEY),
    ).toContain('run-1');
  });

  it('drops a corrupt payload rather than restoring a fake job', () => {
    window.sessionStorage.setItem(
      STUDIO_PLAYGROUND_SESSION_KEY,
      JSON.stringify({ 'brand-1': [{ id: 12, type: 'nope' }] }),
    );

    expect(readStudioPlaygroundSessionJobs('brand-1')).toEqual([]);
  });

  it('keeps brands isolated', () => {
    writeStudioPlaygroundSessionJobs('brand-1', [job]);
    expect(readStudioPlaygroundSessionJobs('brand-2')).toEqual([]);
  });
});

describe('brand-tab Crun recipe persistence', () => {
  const start = '00000000-0000-4000-8000-000000000001';
  const end = '00000000-0000-4000-8000-000000000002';
  function videoJob(
    overrides: Partial<NonNullable<StudioPlaygroundJob['recipe']>> = {},
  ): StudioPlaygroundJob {
    if (!job.recipe) throw new Error('Expected recipe fixture');
    return {
      ...job,
      type: 'video',
      recipe: {
        ...job.recipe,
        type: 'video',
        modelKey: 'crun/kling/v2-5-turbo-pro',
        duration: 10,
        references: [start],
        endFrameId: end,
        crunControls: {
          modelKey: 'crun/kling/v2-5-turbo-pro',
          contractVersion: 'video-v1',
          guidanceScale: 0,
          negativePrompt: '  untouched submitted bytes  ',
        },
        ...overrides,
      },
    };
  }
  it('round-trips ordered frames and exact submitted negative bytes only within the current brand', () => {
    const value = videoJob();
    writeStudioPlaygroundSessionJobs('crun-brand', [value]);
    expect(
      readStudioPlaygroundSessionJobs('crun-brand')[0]?.recipe,
    ).toMatchObject({
      references: [start],
      endFrameId: end,
      duration: 10,
      crunControls: {
        guidanceScale: 0,
        negativePrompt: '  untouched submitted bytes  ',
      },
    });
    expect(readStudioPlaygroundSessionJobs('different-brand')).toEqual([]);
    expect(
      readStudioPlaygroundSessionJobs('crun-brand')[0]?.recipe?.crunControls,
    ).not.toBe(value.recipe?.crunControls);
  });
  it('retains Veo false and reviewed shape without inserting defaults', () => {
    const value = videoJob({
      modelKey: 'crun/google/veo3-1-fast-t2v',
      duration: 8,
      resolution: '4k',
      aspectRatio: '9:16',
      references: [],
      endFrameId: undefined,
      crunControls: {
        modelKey: 'crun/google/veo3-1-fast-t2v',
        contractVersion: 'video-v1',
        translatePrompt: false,
      },
    });
    writeStudioPlaygroundSessionJobs('crun-brand', [value]);
    expect(
      readStudioPlaygroundSessionJobs('crun-brand')[0]?.recipe,
    ).toMatchObject({
      duration: 8,
      resolution: '4k',
      crunControls: { translatePrompt: false },
    });
  });
  it.each([
    { references: [] },
    { references: [start, end] },
    { endFrameId: start },
    { endFrameId: 'https://secret.invalid/end' },
    { duration: 6 },
    { resolution: '720p' },
    { aspectRatio: '16:9' },
    {
      crunControls: {
        modelKey: 'crun/kling/v2-5-turbo-pro',
        contractVersion: 'video-v1',
        guidanceScale: Number.NaN,
      },
    },
  ])('drops invalid recipe %j but retains its surrounding job', (patch) => {
    const value = videoJob(patch);
    writeStudioPlaygroundSessionJobs('crun-brand', [value]);
    const stored = readStudioPlaygroundSessionJobs('crun-brand');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.recipe).toBeUndefined();
  });
  it('round-trips image format and strips arbitrary quote/credential metadata outside the allowed envelope', () => {
    if (!job.recipe) throw new Error('Expected recipe fixture');
    const recipe = {
      ...job.recipe,
      type: 'image' as const,
      modelKey: 'crun/google/nano-banana-pro',
      resolution: '2K',
      crunControls: {
        modelKey: 'crun/google/nano-banana-pro',
        contractVersion: 'image-v1',
        outputFormat: 'jpg',
      },
      crunQuoteId: 'secret quote',
      apiKey: 'secret key',
      providerUrl: 'https://signed.invalid/provider',
    };
    writeStudioPlaygroundSessionJobs('crun-brand', [{ ...job, recipe }]);
    const restored = readStudioPlaygroundSessionJobs('crun-brand')[0]?.recipe;
    expect(restored?.crunControls).toMatchObject({ outputFormat: 'jpg' });
    const persisted = window.sessionStorage.getItem(
      STUDIO_PLAYGROUND_SESSION_KEY,
    );
    expect(persisted).not.toContain('secret quote');
    expect(persisted).not.toContain('secret key');
    expect(persisted).not.toContain('signed.invalid');
  });
});
