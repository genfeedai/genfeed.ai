import { buildVideoJudgeContext } from '@api/collections/evaluations/services/evaluation-judge-input';
import { describe, expect, it } from 'vitest';

describe('buildVideoJudgeContext', () => {
  it('keeps the brand name and guidelines when there are no video rules', () => {
    expect(
      buildVideoJudgeContext(
        undefined,
        { guidelines: 'Be bold.', name: 'Genfeed' },
        20,
      ),
    ).toEqual({
      brand: { description: 'Be bold.', label: 'Genfeed', text: 'Be bold.' },
      durationSeconds: 20,
      prompt: undefined,
    });
  });

  it('appends the approved palette, logo and video rules to the guidelines', () => {
    const context = buildVideoJudgeContext(
      undefined,
      { guidelines: 'Be bold.', name: 'Genfeed' },
      20,
      { brandName: 'Genfeed', rulesText: 'Approved palette:\n- #112233 (bg)' },
    );

    expect(context.brand).toEqual({
      description: 'Be bold.\n\nApproved palette:\n- #112233 (bg)',
      label: 'Genfeed',
      text: 'Be bold.\n\nApproved palette:\n- #112233 (bg)',
    });
  });

  it('gives a brand with rules but no written guidelines a brand block', () => {
    const context = buildVideoJudgeContext(undefined, undefined, undefined, {
      brandName: 'Genfeed',
      rulesText: 'Must be avoided:\n- Stock photos',
    });

    expect(context.brand).toEqual({
      description: 'Must be avoided:\n- Stock photos',
      label: 'Genfeed',
      text: 'Must be avoided:\n- Stock photos',
    });
  });
});
