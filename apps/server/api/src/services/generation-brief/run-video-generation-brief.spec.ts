import { runVideoGenerationBrief } from '@api/services/generation-brief/run-video-generation-brief';
import { PRUNAAI_P_VIDEO_MODEL_KEY } from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('runVideoGenerationBrief', () => {
  it('stamps the originating surface on compiled evidence (#3469)', () => {
    const result = runVideoGenerationBrief({
      durationSeconds: 5,
      height: 1080,
      model: MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
      objective: 'a product spinning on a table',
      surface: 'studio',
      width: 1920,
    });

    expect(result.evidence).toMatchObject({
      modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
      status: 'compiled',
      surface: 'studio',
    });
  });

  it('produces equivalent video briefs across surfaces', () => {
    const input = {
      durationSeconds: 5,
      height: 1080,
      model: MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
      objective: 'a product spinning on a table',
      width: 1920,
    };

    const studio = runVideoGenerationBrief({ ...input, surface: 'studio' });
    const schedule = runVideoGenerationBrief({
      ...input,
      surface: 'schedule',
    });

    expect(studio.brief).toEqual(schedule.brief);
    expect(studio.dispatch).toEqual(schedule.dispatch);
    expect(studio.evidence.surface).toBe('studio');
    expect(schedule.evidence.surface).toBe('schedule');
  });

  it('compiles Seedance native extension with the provider sentinel and extend evidence', () => {
    const result = runVideoGenerationBrief({
      actionVerb: 'extend',
      durationSeconds: 8,
      height: 1080,
      model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      objective: 'Continue the shot into the next room',
      surface: 'workflow',
      videoReferenceIds: ['source-video-1'],
      width: 1920,
    });

    expect(result.dispatch).toMatchObject({
      aspect_ratio: 'adaptive',
      duration: -1,
      reference_videos: ['source-video-1'],
    });
    expect(result.evidence).toMatchObject({
      actionVerb: 'extend',
      dispatchMode: 'native',
    });
    expect(result.brief?.output.durationSeconds).toBe(8);
  });

  describe('brandContext (#4676)', () => {
    it('reaches the compiled prompt when passed, independent of avoid-forced fidelity', () => {
      const result = runVideoGenerationBrief({
        avoid: ['logo overlay'],
        brandContext: 'Warm, confident, editorial voice.',
        durationSeconds: 5,
        height: 1080,
        model: MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
        objective: 'a product spinning on a table',
        surface: 'studio',
        width: 1920,
      });

      expect(result.brief?.intent.brandContext).toBe(
        'Warm, confident, editorial voice.',
      );
      const dispatch = result.dispatch as { prompt: string };
      expect(dispatch.prompt).toContain('Warm, confident, editorial voice.');
    });

    it('never appears when the caller omits it, matching Brand voice off', () => {
      const result = runVideoGenerationBrief({
        durationSeconds: 5,
        height: 1080,
        model: MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
        objective: 'a product spinning on a table',
        surface: 'studio',
        width: 1920,
      });

      expect(result.brief?.intent.brandContext).toBeUndefined();
      const dispatch = result.dispatch as { prompt: string };
      expect(dispatch.prompt).not.toContain('Warm, confident');
    });
  });
});
