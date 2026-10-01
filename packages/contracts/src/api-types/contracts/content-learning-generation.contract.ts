import { z } from 'zod';
import {
  ContentLearningArm,
  ContentLearningMode,
} from '../../enums/content-learning.enum';
import type {
  LearningExperimentCancelInput,
  LearningExperimentCreateInput,
  LearningExperimentEnrollInput,
  LearningGenerationApplicationV1,
  LearningGenerationReceipt,
  LearningReleaseControlInput,
  LearningScopeView,
} from '../../interfaces/analytics/content-learning.interface';

export const learningContractIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) =>
      Array.from(value).every((char) => {
        const point = char.codePointAt(0) ?? 0;
        return point > 31 && (point < 127 || point > 159);
      }),
    'Control characters are forbidden',
  );
export const learningContractHashSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/);
export const learningDescriptorHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const learningContractRevisionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const learningContractVersionSchema =
  learningContractRevisionSchema.min(1);
export const learningFormatSchema = z.enum([
  'text',
  'image',
  'carousel',
  'video',
  'short',
  'thread',
]);
export const learningObjectiveSchema = z.enum([
  'awareness',
  'engagement',
  'authority-proxy',
  'conversion-click',
  'retention-watch',
]);
const arm = z.enum(ContentLearningArm);
const probability = z.number().min(0).max(1);
const metric = z.enum([
  'exposure',
  'views',
  'impressions',
  'reach',
  'videoViews',
  'likes',
  'comments',
  'shares',
  'saves',
  'clicks',
  'averageWatchTimeSeconds',
]);
export const learningCellDescriptorSchema = z.strictObject({
  platform: learningContractIdSchema,
  format: learningFormatSchema,
  objective: learningObjectiveSchema,
  exposureSource: metric,
  metricWeights: z.array(z.tuple([metric, z.number()])),
  retention: z.boolean(),
  windowId: z.literal('48h-v1'),
  configVersion: z.literal('rl-reward-v1-experimental'),
  featureSchema: z.literal('numeric-nine-v1'),
  armCatalogVersion: z.literal('learning-arms-v1'),
});
const vector = z
  .partialRecord(arm, probability)
  .refine(
    (v) =>
      Math.abs(Object.values(v).reduce((sum, p) => sum + p, 0) - 1) <= 1e-9,
    'Probability vector must sum to one',
  );
export const learningGenerationApplicationV1Schema: z.ZodType<LearningGenerationApplicationV1> =
  z
    .strictObject({
      status: z.enum([
        'applied',
        'baseline',
        'shadow',
        'suppressed',
        'unavailable',
      ]),
      reasonCodes: z.array(learningContractIdSchema).max(128),
      appliedArmId: arm.optional(),
      privatePolicyApplied: z.boolean(),
      sharedReleaseApplied: z.boolean(),
      revalidatedAt: z.iso.datetime(),
    })
    .superRefine((v, ctx) => {
      if (v.status === 'applied') {
        if (!v.appliedArmId || v.appliedArmId === ContentLearningArm.BASELINE)
          ctx.addIssue({
            code: 'custom',
            message:
              'Applied private treatment requires a non-baseline executed arm',
          });
      } else if (v.status === 'baseline') {
        if (v.privatePolicyApplied || v.appliedArmId !== undefined)
          ctx.addIssue({
            code: 'custom',
            message: 'Baseline cannot claim private treatment',
          });
      } else if (
        v.privatePolicyApplied ||
        v.sharedReleaseApplied ||
        v.appliedArmId
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Inactive application cannot claim executed contribution',
        });
      }
    });
export const learningGenerationReceiptSchema: z.ZodType<LearningGenerationReceipt> =
  z
    .strictObject({
      decisionId: learningContractIdSchema.optional(),
      credentialId: learningContractIdSchema.optional(),
      reason: learningContractIdSchema.optional(),
      mode: z.union([
        z.enum(ContentLearningMode),
        z.enum(['no_destination', 'unavailable']),
      ]),
      accountRevision: learningContractRevisionSchema.optional(),
      scopeRevision: learningContractRevisionSchema.optional(),
      epoch: learningContractRevisionSchema.optional(),
      armId: arm.optional(),
      probabilities: vector.optional(),
      selectedProbability: probability.optional(),
      assignment: z.enum(['pilot', 'control']).optional(),
      assignmentProbability: probability.optional(),
      executionProbability: probability.optional(),
      executionProbabilities: vector.optional(),
      treatmentProbabilities: vector.optional(),
      controlProbabilities: vector.optional(),
      cellDescriptor: learningCellDescriptorSchema.optional(),
      descriptorHash: learningDescriptorHashSchema.optional(),
      policyVersionId: learningContractIdSchema.optional(),
      sharedReleaseId: learningContractIdSchema.optional(),
      sharedReleaseRevision: learningContractRevisionSchema.optional(),
      baselineId: learningContractIdSchema.optional(),
      configVersion: learningContractIdSchema,
      synthetic: z.boolean(),
      application: learningGenerationApplicationV1Schema.optional(),
      opportunityId: learningContractIdSchema.optional(),
      experimentId: learningContractIdSchema.optional(),
      sharedPolicyId: learningContractIdSchema.optional(),
      brandPreferenceRevision: learningContractRevisionSchema.optional(),
    })
    .superRefine((v, ctx) => {
      const selected =
        v.armId === undefined ? undefined : v.probabilities?.[v.armId];
      if (
        v.probabilities &&
        (selected === undefined ||
          v.selectedProbability === undefined ||
          Math.abs(selected - v.selectedProbability) > 1e-9)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Selected probability must agree with selected arm',
        });
      const app = v.application;
      if (app?.status === 'applied') {
        if (
          v.mode !== ContentLearningMode.LIVE ||
          v.synthetic ||
          !v.decisionId ||
          !v.credentialId ||
          !v.baselineId ||
          !v.opportunityId ||
          !v.experimentId ||
          v.accountRevision === undefined ||
          v.scopeRevision === undefined ||
          v.epoch === undefined ||
          !v.cellDescriptor ||
          !v.descriptorHash ||
          v.armId !== app.appliedArmId ||
          !v.selectedProbability ||
          !v.probabilities ||
          !v.assignment ||
          !v.assignmentProbability ||
          !v.executionProbability ||
          !v.executionProbabilities ||
          !v.treatmentProbabilities ||
          !v.controlProbabilities
        )
          ctx.addIssue({
            code: 'custom',
            message:
              'Applied treatment requires complete real live experiment provenance',
          });
        if (
          v.assignment &&
          v.assignmentProbability !== undefined &&
          v.probabilities &&
          v.executionProbabilities &&
          v.treatmentProbabilities &&
          v.controlProbabilities
        ) {
          const p =
            v.assignment === 'pilot'
              ? v.assignmentProbability
              : 1 - v.assignmentProbability;
          const conditional =
            v.assignment === 'pilot'
              ? v.treatmentProbabilities
              : v.controlProbabilities;
          for (const key of Object.values(ContentLearningArm)) {
            const marginal =
              p * (v.treatmentProbabilities[key] ?? 0) +
              (1 - p) * (v.controlProbabilities[key] ?? 0);
            if (
              Math.abs((v.probabilities[key] ?? 0) - (conditional[key] ?? 0)) >
                1e-9 ||
              Math.abs((v.executionProbabilities[key] ?? 0) - marginal) > 1e-9
            )
              ctx.addIssue({
                code: 'custom',
                message:
                  'Conditional and marginal probabilities must match assignment',
              });
          }
          if (
            v.armId &&
            (v.executionProbability === undefined ||
              Math.abs(
                v.executionProbability -
                  (v.executionProbabilities[v.armId] ?? 0),
              ) > 1e-9)
          )
            ctx.addIssue({
              code: 'custom',
              message: 'Execution probability must match marginal selected arm',
            });
        }
        if (app.privatePolicyApplied && !v.policyVersionId)
          ctx.addIssue({
            code: 'custom',
            message: 'Private learned application requires policy identity',
          });
      }
      if (
        app?.status === 'baseline' &&
        v.armId !== undefined &&
        v.armId !== ContentLearningArm.BASELINE
      )
        ctx.addIssue({
          code: 'custom',
          message:
            'Baseline application cannot execute selected nonbaseline arm',
        });
      if (
        app?.sharedReleaseApplied &&
        (!v.sharedReleaseId ||
          v.sharedReleaseRevision === undefined ||
          !v.sharedPolicyId)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Shared application requires release and policy attribution',
        });
    });
const dtoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
export const learningExperimentCreateInputSchema: z.ZodType<LearningExperimentCreateInput> =
  z.strictObject({
    kind: z.enum(['private_pilot', 'shared_stage']),
    cellKey: learningContractIdSchema,
    candidateId: learningContractIdSchema,
    controlId: learningContractIdSchema,
    startAt: dtoDate,
    endAt: dtoDate,
    approvedArmIds: z
      .array(arm)
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length, 'Duplicate arms'),
    requestId: z.uuid(),
  });
export const learningExperimentEnrollInputSchema: z.ZodType<LearningExperimentEnrollInput> =
  z.strictObject({
    experimentId: learningContractIdSchema,
    credentialId: learningContractIdSchema,
    noticeVersion: learningContractIdSchema,
    expectedRevision: learningContractRevisionSchema,
    requestId: z.uuid(),
  });
export const learningExperimentCancelInputSchema: z.ZodType<LearningExperimentCancelInput> =
  z.strictObject({
    expectedRevision: learningContractRevisionSchema,
    reason: learningContractIdSchema,
    requestId: z.uuid(),
  });
export const learningReleaseControlInputSchema: z.ZodType<LearningReleaseControlInput> =
  z
    .strictObject({
      action: z.enum(['canary', 'limited', 'stable', 'pause', 'rollback']),
      expectedRevision: learningContractRevisionSchema,
      requestId: z.uuid(),
      reason: learningContractIdSchema,
      experimentId: learningContractIdSchema.optional(),
      reportId: learningContractIdSchema.optional(),
    })
    .superRefine((v, ctx) => {
      if (
        (v.action === 'limited' || v.action === 'stable') &&
        (!v.experimentId || !v.reportId)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Promotion requires experiment and report identity',
        });
    });

export const learningScopeViewSchema: z.ZodType<LearningScopeView> =
  z.strictObject({
    scopeKey: learningContractIdSchema,
    epoch: learningContractRevisionSchema,
    revision: learningContractRevisionSchema,
    descriptor: learningCellDescriptorSchema,
    descriptorHash: learningDescriptorHashSchema,
    baselineCount: learningContractRevisionSchema,
    activePolicyId: learningContractIdSchema.nullable(),
    pinnedPolicyId: learningContractIdSchema.nullable(),
    lastValidRewardAt: z.iso.datetime().nullable(),
    unavailableReasons: z
      .array(
        z
          .string()
          .min(1)
          .max(96)
          .regex(/^[a-z][a-z0-9_.:-]*$/),
      )
      .max(128),
  });
