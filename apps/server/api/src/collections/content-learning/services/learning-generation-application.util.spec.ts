import type { LearningResolution } from '@api/collections/content-learning/services/learning-decision.service';
import {
  learningGenerationApplicationReceiptV1,
  unavailableLearningReceiptV1,
} from '@api/collections/content-learning/services/learning-generation-application.util';
import { ContentLearningArm, ContentLearningMode } from '@genfeedai/contracts';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import { learningContribution } from '@genfeedai/harness';
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

function appliedResolution(): LearningResolution {
  const treatment = {
    'baseline-v1': 0.2,
    'question-example-v1': 0.7,
    'proof-steps-v1': 0.1,
  };
  return {
    receipt: {
      decisionId: 'decision',
      credentialId: 'credential',
      mode: ContentLearningMode.LIVE,
      accountRevision: 1,
      scopeRevision: 1,
      epoch: 1,
      armId: ContentLearningArm.QUESTION_EXAMPLE,
      probabilities: treatment,
      treatmentProbabilities: treatment,
      controlProbabilities: baselineVector,
      executionProbabilities: {
        'baseline-v1': 0.92,
        'question-example-v1': 0.07,
        'proof-steps-v1': 0.01,
      },
      selectedProbability: 0.7,
      assignment: 'pilot',
      assignmentProbability: 0.1,
      executionProbability: 0.07,
      cellDescriptor: {
        platform: 'twitter',
        format: 'text',
        objective: 'awareness',
        exposureSource: 'impressions',
        metricWeights: [['likes', 1]],
        retention: false,
        windowId: '48h-v1',
        configVersion: 'rl-reward-v1-experimental',
        featureSchema: 'numeric-nine-v1',
        armCatalogVersion: 'learning-arms-v1',
      },
      descriptorHash: 'a'.repeat(64),
      baselineId: 'baseline',
      opportunityId: 'opportunity',
      experimentId: 'experiment',
      policyVersionId: 'policy',
      configVersion: 'rl-reward-v1-experimental',
      synthetic: false,
    },
    contribution: learningContribution(ContentLearningArm.QUESTION_EXAMPLE),
    exclusions: [],
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
  it('maps a control opportunity to baseline and keeps its provenance', () => {
    const resolution = decisionReceipt('experiment_control');
    resolution.receipt.opportunityId = 'opportunity';
    resolution.receipt.experimentId = 'experiment';
    const receipt = learningGenerationApplicationReceiptV1(resolution, at);
    expect(receipt.application).toMatchObject({
      status: 'baseline',
      reasonCodes: ['experiment_control'],
      privatePolicyApplied: false,
    });
    expect(receipt).toMatchObject({
      opportunityId: 'opportunity',
      experimentId: 'experiment',
    });
    expect(learningGenerationReceiptSchema.safeParse(receipt).success).toBe(
      true,
    );
  });
  it('appends sorted, unique exclusion reason codes after the primary reason', () => {
    const resolution = decisionReceipt('experiment_treatment_baseline');
    resolution.exclusions = [
      {
        armId: 'question-example-v1',
        reasonCode: 'learning.missing_approved_example',
      },
      { armId: 'proof-steps-v1', reasonCode: 'brand_compatibility_unknown' },
      { armId: 'proof-steps-v1', reasonCode: 'brand_compatibility_unknown' },
    ];
    const receipt = learningGenerationApplicationReceiptV1(resolution, at);
    expect(receipt.application?.status).toBe('baseline');
    expect(receipt.application?.reasonCodes).toEqual([
      'experiment_treatment_baseline',
      'learning_arm_excluded:proof-steps-v1:brand_compatibility_unknown',
      'learning_arm_excluded:question-example-v1:learning.missing_approved_example',
    ]);
    expect(learningGenerationReceiptSchema.safeParse(receipt).success).toBe(
      true,
    );
  });
  it('leaves reason codes unchanged without exclusions', () => {
    const resolution = decisionReceipt('shadow');
    resolution.exclusions = [];
    expect(
      learningGenerationApplicationReceiptV1(resolution, at).application
        ?.reasonCodes,
    ).toEqual(['shadow']);
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
  it('reports an exact, fully attributed live pilot treatment as applied', () => {
    const receipt = learningGenerationApplicationReceiptV1(
      appliedResolution(),
      at,
    );
    expect(receipt.application).toEqual({
      status: 'applied',
      reasonCodes: [],
      appliedArmId: ContentLearningArm.QUESTION_EXAMPLE,
      privatePolicyApplied: true,
      sharedReleaseApplied: false,
      revalidatedAt: at.toISOString(),
    });
    expect(learningGenerationReceiptSchema.safeParse(receipt).success).toBe(
      true,
    );
  });
  it.each([
    [
      'a different arm tactic',
      (r: LearningResolution) => {
        r.contribution = learningContribution(ContentLearningArm.PROOF_STEPS);
      },
    ],
    [
      'no opportunity',
      (r: LearningResolution) => {
        delete r.receipt.opportunityId;
      },
    ],
    [
      'no policy version',
      (r: LearningResolution) => {
        delete r.receipt.policyVersionId;
      },
    ],
    [
      'unknown compatibility',
      (r: LearningResolution) => {
        delete r.exclusions;
      },
    ],
    [
      'an excluded arm',
      (r: LearningResolution) => {
        r.exclusions = [
          {
            armId: ContentLearningArm.QUESTION_EXAMPLE,
            reasonCode: 'learning.test',
          },
        ];
      },
    ],
    [
      'shadow mode',
      (r: LearningResolution) => {
        r.receipt.mode = ContentLearningMode.SHADOW;
      },
    ],
    [
      'a control assignment',
      (r: LearningResolution) => {
        r.receipt.assignment = 'control';
      },
    ],
  ])('suppresses a contribution with %s', (_name, mutate) => {
    const resolution = appliedResolution();
    mutate(resolution);
    const receipt = learningGenerationApplicationReceiptV1(resolution, at);
    expect(receipt.application).toMatchObject({
      status: 'suppressed',
      reasonCodes: expect.arrayContaining([
        'learning_contribution_unrecognized',
      ]),
      privatePolicyApplied: false,
    });
    expect(receipt.application?.appliedArmId).toBeUndefined();
  });
  it('never applies the baseline arm even with a contribution', () => {
    const resolution = appliedResolution();
    resolution.receipt.armId = ContentLearningArm.BASELINE;
    resolution.receipt.selectedProbability = 0.2;
    const receipt = learningGenerationApplicationReceiptV1(resolution, at);
    expect(receipt.application?.status).not.toBe('applied');
  });
  it.each(['learning_incompatible', 'brand_compatibility_unknown'])(
    'maps decision reason %s to suppressed',
    (reason) => {
      const receipt = learningGenerationApplicationReceiptV1(
        decisionReceipt(reason),
        at,
      );
      expect(receipt.application).toMatchObject({
        status: 'suppressed',
        reasonCodes: [reason],
      });
    },
  );
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
