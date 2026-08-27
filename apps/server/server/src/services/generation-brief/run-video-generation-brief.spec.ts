import { runVideoGenerationBrief } from '@server/services/generation-brief/run-video-generation-brief';
import { PRUNAAI_P_VIDEO_MODEL_KEY } from '@api-types/contracts/video-generation-capability-profile.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
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
});
