import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { z } from 'zod';

const identity = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const dimensions = modelBillableQuoteSnapshotSchema.shape.quantities;
const providerTarget = z.union([
  z.object({ model: identity }).strict(),
  z.object({ version: identity }).strict(),
]);
const outputAdapter = z
  .object({
    adapterVersion: z.literal(1),
    representation: z.enum(['uri', 'uri-array']),
    requests: z.literal(1),
    outputs: z.literal(1),
    countInput: identity.optional(),
  })
  .strict()
  .superRefine((output, context) => {
    if (output.representation === 'uri' && output.countInput !== undefined)
      context.addIssue({
        code: 'custom',
        message: 'Scalar output cannot declare an array count mapping',
      });
  });
const reviewedOutput = z.discriminatedUnion('provider', [
  z
    .object({
      modelKey: identity,
      provider: z.literal('replicate'),
      endpoint: identity,
      version: identity,
      target: providerTarget,
      output: outputAdapter,
    })
    .strict(),
  z
    .object({
      modelKey: identity,
      provider: z.literal('fal'),
      endpoint: identity,
      version: identity,
      target: z.object({ endpoint: identity }).strict(),
      output: z
        .object({
          adapterVersion: z.literal(1),
          representation: z.literal('video-object'),
          requests: z.literal(1),
          outputs: z.literal(1),
          countInput: z.never().optional(),
        })
        .strict(),
    })
    .strict(),
]);
const preparationContract = z
  .object({
    version: z.literal(1),
    preparationVersion: z.literal(1),
    actionId: z.enum(['imageGen', 'videoGen']),
    brief: z.union([
      z
        .object({
          briefVersion: z.number().int().positive(),
          compilerId: identity,
          compilerVersion: z.number().int().positive(),
          profileId: identity,
          profileVersion: z.number().int().positive(),
          modelKey: identity,
          mediaKind: z.enum(['image', 'video']),
        })
        .strict(),
      z
        .object({
          kind: z.literal('reviewed-provider-schema'),
          modelKey: identity,
          mediaKind: z.literal('video'),
          schemaVersion: identity,
          schemaFamily: identity,
          inputSchemaHash: hash,
          adapterVersion: z.literal(1),
        })
        .strict(),
    ]),
    reviewedOutput,
  })
  .strict();
const projectionPolicy = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('frozen-pricing-profile'),
      version: z.literal(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('exact-provider-input'),
      version: z.literal(1),
      inputKeys: z
        .array(z.string())
        .refine(
          (keys) =>
            new Set(keys).size === keys.length &&
            [...keys].sort().every((key, index) => key === keys[index]),
          'Input keys must be sorted and unique',
        ),
      inputFingerprint: hash,
    })
    .strict(),
]);
export const workflowGenerationDispatchSchema = z
  .object({
    contractVersion: identity,
    preparationContract,
    projectionPolicy,
    provider: identity,
    modelKey: identity,
    target: identity,
    credentialRoute: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('platform') }),
      z.object({ kind: z.literal('byok'), credentialId: identity }),
    ]),
    quantities: dimensions.extend({
      requests: z.literal(1),
      outputs: z.literal(1),
    }),
    billableFingerprint: hash,
  })
  .superRefine((dispatch, context) => {
    const prepared = dispatch.preparationContract;
    const output = prepared.reviewedOutput;
    if (
      'kind' in prepared.brief &&
      (output.provider !== 'fal' ||
        prepared.brief.schemaVersion !== output.version ||
        prepared.actionId !== 'videoGen')
    )
      context.addIssue({
        code: 'custom',
        message:
          'Reviewed schema preparation differs from its Fal output contract',
      });
    if (dispatch.provider !== output.provider)
      context.addIssue({
        code: 'custom',
        message: 'Dispatch provider differs from reviewed output provider',
      });
    if (
      output.provider === 'fal' &&
      (prepared.actionId !== 'videoGen' ||
        output.target.endpoint !== output.endpoint)
    )
      context.addIssue({
        code: 'custom',
        message:
          'Fal video output differs from its prepared action or endpoint',
      });
  });

export const workflowGenerationNodeAllocationSchema = z
  .object({
    nodeId: identity,
    actionId: identity,
    operationId: hash,
    owner: z.literal('workflow-execution'),
    billingMode: z.enum(['credits', 'byok']),
    dispatch: workflowGenerationDispatchSchema,
    quote: modelBillableQuoteSnapshotSchema.optional(),
  })
  .superRefine((allocation, context) => {
    const platform = allocation.billingMode === 'credits';
    if (platform !== (allocation.dispatch.credentialRoute.kind === 'platform'))
      context.addIssue({
        code: 'custom',
        message: 'Allocation credential and billing owner differ',
      });
    if (
      platform !==
      (allocation.dispatch.projectionPolicy.kind === 'frozen-pricing-profile')
    )
      context.addIssue({
        code: 'custom',
        message: 'Allocation projection policy differs from billing mode',
      });
    if (!platform && Object.hasOwn(allocation.dispatch.quantities, 'selectors'))
      context.addIssue({
        code: 'custom',
        message: 'BYOK exact-input policy cannot infer pricing selectors',
      });
    const prepared = allocation.dispatch.preparationContract;
    if (
      prepared.actionId !== allocation.actionId ||
      prepared.brief.mediaKind !==
        (allocation.actionId === 'imageGen' ? 'image' : 'video')
    )
      context.addIssue({
        code: 'custom',
        message: 'Prepared action and media kind differ from allocation',
      });
    if (
      prepared.brief.modelKey !== allocation.dispatch.modelKey ||
      prepared.reviewedOutput.modelKey !== allocation.dispatch.modelKey ||
      allocation.dispatch.provider !== prepared.reviewedOutput.provider
    )
      context.addIssue({
        code: 'custom',
        message: 'Prepared model/provider differs from dispatch',
      });
    if (
      allocation.dispatch.target !==
      JSON.stringify(prepared.reviewedOutput.target)
    )
      context.addIssue({
        code: 'custom',
        message: 'Dispatch target differs from reviewed output target',
      });
    if (
      allocation.quote &&
      (allocation.quote.pricingProfile.key !== allocation.dispatch.modelKey ||
        allocation.quote.pricingProfile.provider !==
          allocation.dispatch.provider)
    )
      context.addIssue({
        code: 'custom',
        message: 'Frozen pricing profile differs from dispatch',
      });
    if (platform && !allocation.quote)
      context.addIssue({
        code: 'custom',
        message: 'Platform allocation requires authoritative frozen pricing',
      });
    if (!platform && allocation.quote)
      context.addIssue({
        code: 'custom',
        message: 'BYOK allocation cannot reserve platform funding',
      });
    if (
      allocation.quote &&
      (allocation.quote.quantities.outputs !== 1 ||
        allocation.quote.quantities.requests !== 1 ||
        allocation.quote.provider !== allocation.dispatch.provider ||
        allocation.quote.modelKey !== allocation.dispatch.modelKey)
    )
      context.addIssue({
        code: 'custom',
        message: 'Quote must match the exact compiled dispatch',
      });
  });

export const workflowGenerationManifestSchema = z
  .object({
    executionId: identity,
    organizationId: identity,
    actorUserId: identity,
    workflowVersionId: identity,
    selectedNodeIds: z.array(identity),
    graphFingerprint: hash,
    allocations: z.array(workflowGenerationNodeAllocationSchema),
  })
  .superRefine((manifest, context) => {
    for (const ids of [
      manifest.selectedNodeIds,
      manifest.allocations.map((allocation) => allocation.nodeId),
      manifest.allocations.map((allocation) => allocation.operationId),
    ])
      if (new Set(ids).size !== ids.length)
        context.addIssue({
          code: 'custom',
          message: 'Manifest identities must be unique',
        });
    if (
      manifest.allocations.some(
        (allocation) => !manifest.selectedNodeIds.includes(allocation.nodeId),
      )
    )
      context.addIssue({
        code: 'custom',
        message: 'Allocation is outside the frozen selected graph',
      });
  });

const operation = { operationId: hash };
const intent = {
  ...operation,
  intentId: identity,
  observedAt: z.iso.datetime(),
};
const completion = dimensions.extend({
  completedOutputs: z.literal(1),
  successfulRequests: z.literal(1),
});
export const workflowGenerationOperationEvidenceSchema = z.discriminatedUnion(
  'phase',
  [
    z.object({ ...operation, phase: z.literal('unclaimed') }),
    z.object({ ...operation, phase: z.literal('claimed'), claimId: identity }),
    z.object({ ...intent, phase: z.literal('submission-intent') }),
    z.object({
      ...intent,
      phase: z.literal('accepted'),
      providerJobId: identity,
    }),
    z.object({
      ...intent,
      phase: z.literal('completed'),
      providerJobId: identity.optional(),
      proofId: identity,
      artifacts: z
        .array(
          z.object({
            ingredientId: identity,
            assetKey: identity,
            role: z.literal('primary'),
          }),
        )
        .length(1),
      completion,
    }),
    z.object({
      ...intent,
      phase: z.literal('failed'),
      providerJobId: identity.optional(),
      proofId: identity,
      kind: z.enum([
        'submission-rejected',
        'provider-terminal',
        'local-job-terminal',
      ]),
      provider: identity,
    }),
    z.object({
      ...operation,
      phase: z.literal('unsubmitted'),
      observedAt: z.iso.datetime(),
      reason: z.literal('dispatch-closed'),
    }),
  ],
);

export const workflowExecutionGenerationBillingSchema = z
  .object({
    version: z.literal(1),
    state: z.enum(['preparing', 'funded']),
    manifest: workflowGenerationManifestSchema,
    manifestHash: hash,
    holdAmount: z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/),
    reservationId: identity.nullable(),
    expiresAt: z.iso.datetime(),
    dispatchClosed: z.boolean(),
    operations: z.array(workflowGenerationOperationEvidenceSchema),
  })
  .superRefine((plan, context) => {
    const expected = new Set(
      plan.manifest.allocations.map((allocation) => allocation.operationId),
    );
    const observed = new Set(
      plan.operations.map((evidence) => evidence.operationId),
    );
    if (
      observed.size !== plan.operations.length ||
      observed.size !== expected.size ||
      [...observed].some((id) => !expected.has(id))
    )
      context.addIssue({
        code: 'custom',
        message: 'Evidence must cover each frozen operation exactly once',
      });
    if (
      !plan.dispatchClosed &&
      plan.operations.some((evidence) => evidence.phase === 'unsubmitted')
    )
      context.addIssue({
        code: 'custom',
        message: 'Unsubmitted proof requires dispatch closure',
      });
  });
