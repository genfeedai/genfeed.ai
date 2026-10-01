import { describe, expect, it } from 'vitest';
import {
  ContentLearningArm,
  ContentLearningMode,
} from '../../enums/content-learning.enum';
import type {
  LearningAccountView,
  LearningControlInput,
  LearningGenerationReceipt,
} from '../../interfaces/analytics/content-learning.interface';
import { brandLearningApplicationV1Schema } from './branded-generation.contract';
import {
  learningExperimentCancelInputSchema,
  learningExperimentCreateInputSchema,
  learningExperimentEnrollInputSchema,
  learningGenerationReceiptSchema,
  learningReleaseControlInputSchema,
  learningScopeViewSchema,
} from './content-learning-generation.contract';

const hash = 'a'.repeat(64);
const contentHash = `sha256:${hash}`;
const time = '2026-10-01T00:00:00.000Z';
const requestId = '7e3050bd-d135-4866-8c96-7ffafc31c124';
function applied(): LearningGenerationReceipt {
  return {
    mode: ContentLearningMode.LIVE,
    configVersion: 'v1',
    synthetic: false,
    decisionId: 'decision',
    credentialId: 'credential',
    baselineId: 'baseline',
    opportunityId: 'opportunity',
    experimentId: 'experiment',
    accountRevision: 0,
    scopeRevision: 0,
    epoch: 0,
    armId: ContentLearningArm.QUESTION_EXAMPLE,
    selectedProbability: 1,
    probabilities: { 'question-example-v1': 1 },
    assignment: 'pilot',
    assignmentProbability: 0.1,
    executionProbability: 0.1,
    executionProbabilities: { 'question-example-v1': 0.1, 'baseline-v1': 0.9 },
    treatmentProbabilities: { 'question-example-v1': 1 },
    controlProbabilities: { 'baseline-v1': 1 },
    descriptorHash: hash,
    cellDescriptor: {
      platform: 'instagram',
      format: 'text',
      objective: 'engagement',
      exposureSource: 'impressions',
      metricWeights: [['likes', 1]],
      retention: false,
      windowId: '48h-v1',
      configVersion: 'rl-reward-v1-experimental',
      featureSchema: 'numeric-nine-v1',
      armCatalogVersion: 'learning-arms-v1',
    },
    application: {
      status: 'applied',
      reasonCodes: [],
      appliedArmId: ContentLearningArm.QUESTION_EXAMPLE,
      privatePolicyApplied: false,
      sharedReleaseApplied: false,
      revalidatedAt: time,
    },
  };
}
describe('learning decision compatibility and executed provenance', () => {
  it('preserves application-absent legacy receipts without invented application', () => {
    const old: LearningGenerationReceipt = {
      mode: ContentLearningMode.SHADOW,
      configVersion: 'old',
      synthetic: false,
    };
    expect(learningGenerationReceiptSchema.parse(old)).toEqual(old);
  });
  it('accepts fixed experiment treatment without inventing learned policy', () => {
    expect(learningGenerationReceiptSchema.safeParse(applied()).success).toBe(
      true,
    );
  });
  it('requires policy identity exactly when private policy is applied', () => {
    const v = applied();
    if (!v.application) throw new Error('Fixture application missing');
    v.application = { ...v.application, privatePolicyApplied: true };
    expect(learningGenerationReceiptSchema.safeParse(v).success).toBe(false);
    v.policyVersionId = 'policy';
    expect(learningGenerationReceiptSchema.safeParse(v).success).toBe(true);
  });
  it.each([
    'opportunityId',
    'experimentId',
    'decisionId',
    'credentialId',
    'baselineId',
    'accountRevision',
    'scopeRevision',
    'epoch',
    'cellDescriptor',
    'descriptorHash',
    'selectedProbability',
    'probabilities',
    'assignment',
    'assignmentProbability',
    'executionProbability',
    'executionProbabilities',
    'treatmentProbabilities',
    'controlProbabilities',
  ] as const)('rejects new applied receipt missing %s', (key) => {
    const v = applied();
    delete v[key];
    expect(learningGenerationReceiptSchema.safeParse(v).success).toBe(false);
  });
  it.each(['shadow', 'suppressed', 'unavailable'] as const)(
    'preserves historical selected provenance for %s with no application',
    (status) => {
      const v = applied();
      v.application = {
        status,
        reasonCodes: ['learning_control_changed'],
        privatePolicyApplied: false,
        sharedReleaseApplied: false,
        revalidatedAt: time,
      };
      expect(learningGenerationReceiptSchema.safeParse(v).success).toBe(true);
      v.application.privatePolicyApplied = true;
      expect(learningGenerationReceiptSchema.safeParse(v).success).toBe(false);
    },
  );
  it('rejects selected/executed arm and conditional/marginal mismatch', () => {
    const v = applied();
    v.armId = ContentLearningArm.PROOF_STEPS;
    expect(learningGenerationReceiptSchema.safeParse(v).success).toBe(false);
    const x = applied();
    x.executionProbabilities = {
      'baseline-v1': 0.8,
      'question-example-v1': 0.2,
    };
    expect(learningGenerationReceiptSchema.safeParse(x).success).toBe(false);
    const y = applied();
    y.probabilities = { 'question-example-v1': 0.5, 'baseline-v1': 0.5 };
    y.selectedProbability = 0.5;
    expect(learningGenerationReceiptSchema.safeParse(y).success).toBe(false);
  });
  it.each([NaN, Infinity, -0.1, 1.1])(
    'rejects nonfinite/out-of-range probabilities %s',
    (n) => {
      expect(
        learningGenerationReceiptSchema.safeParse({
          ...applied(),
          selectedProbability: n,
        }).success,
      ).toBe(false);
    },
  );
  it('rejects unknown arm vector keys and invalid sums', () => {
    expect(
      learningGenerationReceiptSchema.safeParse({
        ...applied(),
        probabilities: { alien: 1 },
      }).success,
    ).toBe(false);
    expect(
      learningGenerationReceiptSchema.safeParse({
        ...applied(),
        probabilities: { 'question-example-v1': 0.8 },
      }).success,
    ).toBe(false);
  });
  it('requires explicit new application and matching shared attribution', () => {
    const v = applied();
    v.sharedReleaseId = 'release';
    v.sharedReleaseRevision = 1;
    v.sharedPolicyId = 'policy';
    if (!v.application) throw new Error('Fixture application missing');
    v.application = { ...v.application, sharedReleaseApplied: true };
    const wrapper = {
      schemaVersion: 1,
      brandFeedback: { status: 'not_applicable', sourceIds: [] },
      global: {
        status: 'applied',
        releaseId: 'release',
        releaseRevision: 1,
        policyId: 'policy',
        descriptorHash: hash,
        contributionHash: contentHash,
        brandPreferenceRevision: 0,
        stage: 'stable',
        scope: {
          platform: 'instagram',
          format: 'text',
          objective: 'engagement',
        },
        revalidatedAt: time,
      },
      privateAccount: v,
    };
    expect(brandLearningApplicationV1Schema.safeParse(wrapper).success).toBe(
      true,
    );
    expect(
      brandLearningApplicationV1Schema.safeParse({
        ...wrapper,
        global: { ...wrapper.global, policyId: 'other' },
      }).success,
    ).toBe(false);
    expect(
      brandLearningApplicationV1Schema.safeParse({
        ...wrapper,
        privateAccount: {
          mode: 'no_destination',
          configVersion: 'v1',
          synthetic: false,
        },
      }).success,
    ).toBe(false);
  });
  it('keeps accountless stable global independent from private unavailable', () => {
    const wrapper = {
      schemaVersion: 1,
      brandFeedback: { status: 'not_applicable', sourceIds: [] },
      global: {
        status: 'applied',
        releaseId: 'release',
        releaseRevision: 1,
        policyId: 'policy',
        descriptorHash: hash,
        contributionHash: contentHash,
        brandPreferenceRevision: 0,
        stage: 'stable',
        scope: {
          platform: 'instagram',
          format: 'text',
          objective: 'engagement',
        },
        revalidatedAt: time,
      },
      privateAccount: {
        mode: 'no_destination',
        configVersion: 'v1',
        synthetic: false,
        application: {
          status: 'unavailable',
          reasonCodes: ['no_destination'],
          privatePolicyApplied: false,
          sharedReleaseApplied: false,
          revalidatedAt: time,
        },
      },
    };
    expect(brandLearningApplicationV1Schema.safeParse(wrapper).success).toBe(
      true,
    );
    expect(
      brandLearningApplicationV1Schema.safeParse({
        ...wrapper,
        global: { ...wrapper.global, stage: 'canary' },
      }).success,
    ).toBe(false);
  });
  it('baseline never claims private or nonbaseline executed arm', () => {
    const v = applied();
    v.application = {
      status: 'baseline',
      reasonCodes: [],
      privatePolicyApplied: false,
      sharedReleaseApplied: false,
      revalidatedAt: time,
    };
    expect(learningGenerationReceiptSchema.safeParse(v).success).toBe(false);
    v.armId = ContentLearningArm.BASELINE;
    delete v.probabilities;
    expect(learningGenerationReceiptSchema.safeParse(v).success).toBe(true);
  });
  it('retains optional account/control additions at compile time', () => {
    const control: LearningControlInput = {
      action: 'pause',
      expectedRevision: 0,
      requestId,
      reason: 'pause',
    };
    const account: LearningAccountView = {
      id: 'a',
      organizationId: 'o',
      brandId: 'b',
      credentialId: 'c',
      mode: ContentLearningMode.SHADOW,
      revision: 0,
      epoch: 0,
      sharingConsentVersion: null,
      sharedReleasePreference: 'automatic',
      pinnedReleaseId: null,
      approvedArmIds: [],
      baselineCount: 0,
      activePolicyId: null,
      failureReason: null,
      driftState: null,
    };
    expect(control.experimentId).toBeUndefined();
    expect(account.scopes).toBeUndefined();
  });
});
describe('learning transport mutation bounds', () => {
  const create = {
    kind: 'private_pilot',
    cellKey: 'cell',
    candidateId: 'candidate',
    controlId: 'control',
    startAt: time,
    endAt: time,
    approvedArmIds: ['baseline-v1'],
    requestId,
  };
  it('accepts exact experiment DTO shape', () => {
    expect(learningExperimentCreateInputSchema.safeParse(create).success).toBe(
      true,
    );
    expect(
      learningExperimentEnrollInputSchema.safeParse({
        experimentId: 'e',
        credentialId: 'c',
        noticeVersion: 'v',
        expectedRevision: 0,
        requestId,
      }).success,
    ).toBe(true);
    expect(
      learningExperimentCancelInputSchema.safeParse({
        expectedRevision: 0,
        reason: 'cancel',
        requestId,
      }).success,
    ).toBe(true);
  });
  it.each([
    { requestId: 'opaque' },
    { approvedArmIds: [] },
    { approvedArmIds: ['baseline-v1', 'baseline-v1'] },
    { cellKey: 'x'.repeat(257) },
    { startAt: '2026-10-01T00:00:00+00:00' },
    { unknown: true },
  ])('rejects malformed experiment mutation %j', (patch) => {
    expect(
      learningExperimentCreateInputSchema.safeParse({ ...create, ...patch })
        .success,
    ).toBe(false);
  });
  it('requires immutable promotion experiment/report IDs', () => {
    const v = {
      action: 'stable',
      expectedRevision: 0,
      requestId,
      reason: 'promote',
    };
    expect(learningReleaseControlInputSchema.safeParse(v).success).toBe(false);
    expect(
      learningReleaseControlInputSchema.safeParse({
        ...v,
        experimentId: 'e',
        reportId: 'r',
      }).success,
    ).toBe(true);
    expect(
      learningReleaseControlInputSchema.safeParse({
        ...v,
        experimentId: 'e',
        reportId: 'r',
        onlineGatePassed: true,
      }).success,
    ).toBe(false);
  });
});

describe('registered learning descriptor hash boundary', () => {
  it('retains standalone legacy raw64 descriptor hash', () => {
    const v = {
      mode: 'shadow',
      configVersion: 'v1',
      synthetic: false,
      descriptorHash: hash,
    };
    expect(learningGenerationReceiptSchema.safeParse(v).success).toBe(true);
    expect(
      learningGenerationReceiptSchema.safeParse({
        ...v,
        descriptorHash: contentHash,
      }).success,
    ).toBe(false);
  });
  it('requires raw64 for complete applied receipt', () => {
    expect(learningGenerationReceiptSchema.safeParse(applied()).success).toBe(
      true,
    );
    expect(
      learningGenerationReceiptSchema.safeParse({
        ...applied(),
        descriptorHash: contentHash,
      }).success,
    ).toBe(false);
  });
  it('checks scope descriptor hash without redefining scope identity', () => {
    const v = {
      scopeKey: 'opaque scope',
      epoch: 0,
      revision: 0,
      descriptor: applied().cellDescriptor,
      descriptorHash: hash,
      baselineCount: 0,
      activePolicyId: null,
      pinnedPolicyId: null,
      lastValidRewardAt: null,
      unavailableReasons: [],
    };
    expect(learningScopeViewSchema.safeParse(v).success).toBe(true);
    for (const bad of [
      contentHash,
      hash.toUpperCase(),
      'g'.repeat(64),
      'a'.repeat(63),
      'a'.repeat(65),
    ])
      expect(
        learningScopeViewSchema.safeParse({ ...v, descriptorHash: bad })
          .success,
      ).toBe(false);
  });
  it('uses raw descriptor but prefixed contribution on applied global', () => {
    const v = {
      schemaVersion: 1,
      brandFeedback: { status: 'not_applicable', sourceIds: [] },
      global: {
        status: 'applied',
        releaseId: 'release',
        releaseRevision: 1,
        policyId: 'policy',
        descriptorHash: hash,
        contributionHash: contentHash,
        brandPreferenceRevision: 0,
        stage: 'stable',
        scope: {
          platform: 'instagram',
          format: 'text',
          objective: 'engagement',
        },
        revalidatedAt: time,
      },
      privateAccount: {
        mode: 'no_destination',
        configVersion: 'v1',
        synthetic: false,
        application: {
          status: 'unavailable',
          reasonCodes: [],
          privatePolicyApplied: false,
          sharedReleaseApplied: false,
          revalidatedAt: time,
        },
      },
    };
    expect(brandLearningApplicationV1Schema.safeParse(v).success).toBe(true);
    expect(
      brandLearningApplicationV1Schema.safeParse({
        ...v,
        global: { ...v.global, descriptorHash: contentHash },
      }).success,
    ).toBe(false);
    expect(
      brandLearningApplicationV1Schema.safeParse({
        ...v,
        global: { ...v.global, contributionHash: hash },
      }).success,
    ).toBe(false);
  });
});
