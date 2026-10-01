import { describe, expect, it } from 'vitest';
import { composeContentHarnessBrief } from '../../src/compose';
import { learningContribution } from '../../src/learning/strategies';
import { ContentHarnessRegistry } from '../../src/registry';

describe('subordinate learning strategies', () => {
  it('compiles selected guidance once without adding claims or modifying explicit instructions', async () => {
    const contribution = learningContribution('proof-steps-v1');
    const brief = await composeContentHarnessBrief(
      new ContentHarnessRegistry(),
      {
        intent: { contentType: 'post', objective: 'engagement' },
        identityContribution: { styleDirectives: ['Use the approved voice.'] },
        learningContribution: contribution,
        learningDecisionId: 'decision',
      },
    );
    expect(brief.styleDirectives[0]).toBe('Use the approved voice.');
    expect(brief.styleDirectives).toHaveLength(2);
    expect(brief.guardrails.join(' ')).toContain('subordinate');
  });
  it('baseline contributes no learned treatment', () =>
    expect(learningContribution('baseline-v1')).toEqual({}));
});
