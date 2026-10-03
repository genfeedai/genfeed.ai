import type { LearningResolution } from '@api/collections/content-learning/services/learning-decision.service';
import {
  learningGenerationApplicationReceiptV1,
  unavailableLearningReceiptV1,
} from '@api/collections/content-learning/services/learning-generation-application.util';
import { ContentLearningArm, ContentLearningMode } from '@genfeedai/contracts';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import { describe, expect, it } from 'vitest';

const at = new Date('2026-10-03T12:00:00.000Z');
const baselineVector = {
  'baseline-v1': 1,
  'question-example-v1': 0,
  'proof-steps-v1': 0,
};
function decisionReceipt(
  reason: string,
  mode: LearningResolution['receipt']['mode'] = ContentLearningMode.LIVE,
): LearningResolution {
  return {
    receipt: {
      decisionId: 'decision',
      credentialId: 'credential',
      mode,
      accountRevision: 1,
      epoch: 1,
      armId: ContentLearningArm.BASELINE,
      probabilities: baselineVector,
      selectedProbability: 1,
      assignment: 'control',
      assignmentProbability: 1,
      executionProbability: 1,
      configVersion: 'rl-reward-v1-experimental',
      synthetic: false,
      reason,
    },
    contribution: {},
  };
}
describe('learningGenerationApplicationReceiptV1', () => {
  it.each([
    ['shadow', 'shadow', ['shadow']],
    ['disabled', 'unavailable', ['disabled']],
    ['paused', 'suppressed', ['paused']],
    ['account_changed', 'suppressed', ['account_changed']],
    ['scope_changed', 'suppressed', ['scope_changed']],
    ['invalid_lineage', 'suppressed', ['invalid_lineage']],
    ['invalid_source', 'suppressed', ['invalid_source']],
    ['expired_policy', 'suppressed', ['expired_policy']],
    ['insufficient_baseline', 'baseline', ['insufficient_baseline']],
    [
      'experiment_assignment_unavailable',
      'baseline',
      ['experiment_assignment_unavailable'],
    ],
    ['harness_off', 'baseline', ['harness_off']],
    ['incompatible_intent', 'baseline', ['incompatible_intent']],
    ['provider_failure', 'baseline', ['provider_failure']],
  ])('maps decision reason %s to %s', (reason, status, reasonCodes) => {
    const receipt = learningGenerationApplicationReceiptV1(
      decisionReceipt(reason),
      at,
    );
    expect(receipt.application).toEqual({
      status,
      reasonCodes,
      privatePolicyApplied: false,
      sharedReleaseApplied: false,
      revalidatedAt: at.toISOString(),
    });
    expect(receipt.decisionId).toBe('decision');
    expect(learningGenerationReceiptSchema.safeParse(receipt).success).toBe(
      true,
    );
  });
  it.each([
    [
      { mode: 'no_destination' as const, reason: 'no_destination' },
      ['no_destination'],
    ],
    [
      { mode: 'unavailable' as const, reason: 'unsupported_cell' },
      ['unsupported_cell'],
    ],
    [
      { mode: 'unavailable' as const, reason: 'decision_missing' },
      ['decision_missing'],
    ],
    [{ mode: 'unavailable' as const }, ['learning_unavailable']],
  ])('maps fallback %o to unavailable', (fallback, reasonCodes) => {
    const receipt = learningGenerationApplicationReceiptV1(
      {
        receipt: {
          ...fallback,
          configVersion: 'rl-reward-v1-experimental',
          synthetic: false,
        },
        contribution: {},
      },
      at,
    );
    expect(receipt.application?.status).toBe('unavailable');
    expect(receipt.application?.reasonCodes).toEqual(reasonCodes);
  });
  it('reports a non-empty contribution as suppressed and never applied', () => {
    const resolution = decisionReceipt('experiment_assignment_unavailable');
    resolution.contribution = { systemDirectives: ['Ask a question'] };
    const receipt = learningGenerationApplicationReceiptV1(resolution, at);
    expect(receipt.application).toMatchObject({
      status: 'suppressed',
      reasonCodes: ['learning_contribution_unrecognized'],
      privatePolicyApplied: false,
      sharedReleaseApplied: false,
    });
    expect(receipt.application?.appliedArmId).toBeUndefined();
  });
  it('fails closed to an unavailable receipt when the receipt is invalid', () => {
    const resolution = decisionReceipt('experiment_assignment_unavailable');
    resolution.receipt.selectedProbability = 0.5;
    expect(learningGenerationApplicationReceiptV1(resolution, at)).toEqual(
      unavailableLearningReceiptV1('learning_receipt_integrity_failed', at),
    );
  });
  it('builds a schema-valid unavailable receipt', () => {
    const receipt = unavailableLearningReceiptV1('learning_unavailable', at);
    expect(learningGenerationReceiptSchema.safeParse(receipt).success).toBe(
      true,
    );
    expect(receipt.application?.status).toBe('unavailable');
  });
});
