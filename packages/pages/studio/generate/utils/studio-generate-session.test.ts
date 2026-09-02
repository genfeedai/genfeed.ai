import { IngredientStatus } from '@genfeedai/contracts';
import type { StudioGenerateJob } from '@pages/studio/generate/types';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  readStudioGenerateSessionJobs,
  STUDIO_GENERATE_SESSION_KEY,
  writeStudioGenerateSessionJobs,
} from './studio-generate-session';

const job: StudioGenerateJob = {
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
    writeStudioGenerateSessionJobs('brand-1', [
      {
        ...job,
        ingredient: { id: 'img-1' } as StudioGenerateJob['ingredient'],
      },
    ]);

    expect(readStudioGenerateSessionJobs('brand-1')).toEqual([
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
    expect(readStudioGenerateSessionJobs('brand-1')[0]).not.toHaveProperty(
      'ingredient',
    );
    expect(
      window.sessionStorage.getItem(STUDIO_GENERATE_SESSION_KEY),
    ).toContain('run-1');
  });

  it('drops a corrupt payload rather than restoring a fake job', () => {
    window.sessionStorage.setItem(
      STUDIO_GENERATE_SESSION_KEY,
      JSON.stringify({ 'brand-1': [{ id: 12, type: 'nope' }] }),
    );

    expect(readStudioGenerateSessionJobs('brand-1')).toEqual([]);
  });

  it('keeps brands isolated', () => {
    writeStudioGenerateSessionJobs('brand-1', [job]);
    expect(readStudioGenerateSessionJobs('brand-2')).toEqual([]);
  });
});
