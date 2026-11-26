import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import {
  WorkflowMediaBillingPlanService,
  type WorkflowMediaDispatchInput,
} from '@api/collections/workflows/services/workflow-media-billing-plan.service';
import { WorkflowMediaCredentialRouteService } from '@api/collections/workflows/services/workflow-media-credential-route.service';
import { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { workflowFundingFixture } from '@api/helpers/utils/credits/workflow-generation-funding.fixture';
import type { ByokService } from '@api/services/byok/byok.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import { IngredientCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { WorkflowGenerationNodeAllocation } from '@genfeedai/contracts/interfaces/billing';
import { findReviewedRateSheetEntry } from '@genfeedai/pricing';
import { createExecutableActionNode } from '@genfeedai/workflows/engine';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/collections/models/services/models.service', () => ({
  ModelsService: class {},
}));
vi.mock(
  '@api/collections/workflows/services/workflow-engine-executor-helper.service',
  () => ({ WorkflowEngineExecutorHelperService: class {} }),
);
vi.mock('@api/services/byok/byok.service', () => ({ ByokService: class {} }));
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@libs/logger/logger.service', () => ({ LoggerService: class {} }));

const MODEL = MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_MOTION_CONTROL;
function reviewedSheet() {
  const entry = findReviewedRateSheetEntry('replicate', MODEL);
  if (!entry)
    throw new Error('The reviewed rate sheet has no motion control row');
  return entry;
}
const sheet = reviewedSheet();

const context = {
  executionId: 'execution-1',
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};
function motionArgs(parameters: Record<string, unknown> = {}) {
  return {
    context,
    executionId: 'execution-1',
    inputs: new Map<string, unknown>([
      ['image', 'image-1'],
      ['video', 'video-1'],
    ]),
    node: createExecutableActionNode({
      actionId: 'motionControl',
      id: 'motion-1',
      parameters: { brandId: 'brand-1', model: MODEL, ...parameters },
    }),
  };
}
function dispatchInput(
  allocation: WorkflowGenerationNodeAllocation,
  args: ReturnType<typeof motionArgs>,
): WorkflowMediaDispatchInput {
  const funding = workflowFundingFixture(args.executionId);
  funding.manifest.organizationId = context.organizationId;
  funding.manifest.actorUserId = context.userId;
  funding.manifest.workflowVersionId = context.workflowVersionId;
  funding.manifest.selectedNodeIds = [args.node.id];
  funding.manifest.allocations = [allocation];
  funding.manifestHash = quoteSnapshotHash(funding.manifest);
  funding.holdAmount = String(allocation.quote?.credits ?? 0);
  funding.operations = [
    { operationId: allocation.operationId, phase: 'unclaimed' },
  ];
  return {
    ...args,
    context,
    funding,
    operationId: allocation.operationId,
  };
}

function fixture(options: { byok?: boolean; seconds?: number } = {}) {
  const reference = { seconds: options.seconds ?? 8, hash: 'a'.repeat(64) };
  const helper = {
    buildMediaIngredientUrl: (id: string) => `https://api.test/images/${id}`,
    buildVideoIngredientUrl: (id: string) => `https://api.test/videos/${id}`,
    extractIngredientId: () => undefined,
    requireBrandId: (brandId: unknown) => String(brandId),
    requireMediaAsset: async (id: string) =>
      id === 'image-1'
        ? { brandId: 'brand-1', category: IngredientCategory.IMAGE, id }
        : {
            brandId: 'brand-1',
            category: IngredientCategory.VIDEO,
            id,
            objectKey: 'ingredients/videos/video-1',
          },
  } as unknown as WorkflowEngineExecutorHelperService;
  const files = {
    fingerprintMedia: vi.fn(async () => ({
      assetHash: reference.hash,
      sizeBytes: 5_000_000,
    })),
    getPresignedDownloadUrlForObjectKey: vi
      .fn()
      .mockResolvedValue('https://storage.test/video-1.mp4'),
    probeMediaFromUrl: vi.fn(async () => ({
      durationSeconds: reference.seconds,
      sizeBytes: 5_000_000,
    })),
  };
  const preparation = new WorkflowMediaProviderPlanService(
    helper,
    {} as LoggerService,
    personasServiceStub(),
    undefined,
    files as unknown as FilesClientService,
  );
  const lookupApiKeyWithIdentity = vi
    .fn()
    .mockResolvedValue(
      options.byok
        ? { credentialId: 'key-1', apiKey: 'byok-secret' }
        : undefined,
    );
  const route = new WorkflowMediaCredentialRouteService({
    lookupApiKeyWithIdentity,
  } as unknown as ByokService);
  // The tariff is the reviewed rate sheet row, so the test prices with the
  // same per-second rates and variant rules the catalog freezes.
  const quotes = new ModelCreditQuoteService({
    findBillablePricingProfile: vi.fn(async () =>
      billableProfile({
        costPerUnit: 1,
        key: MODEL,
        pricingType: 'per-second',
        rateVersion: 'v1',
        requiredSelectorKeys: ['model_variant'],
        requiresReviewedRates: true,
        reviewedPricing: {
          currency: 'USD',
          rates: sheet.rates,
          reviewStatus: 'approved',
          sourceUrl: sheet.sourceUrl,
          variantRules: sheet.variantRules,
          verifiedAt: sheet.verifiedAt,
          version: 'v1',
        },
      }),
    ),
  } as unknown as ModelsService);
  const findFirst = vi.fn().mockResolvedValue({
    endpoint: MODEL,
    id: 'model-1',
    isActive: true,
    isDeleted: false,
    key: MODEL,
    provider: 'replicate',
    providerContracts: [
      {
        endpoint: MODEL,
        inputSchema: { properties: {}, type: 'object' },
        mappingStatus: 'supported',
        modelId: 'model-1',
        openapi: {},
        outputSchema: { format: 'uri', type: 'string' },
        pricing: [],
        provider: 'replicate',
        reviewStatus: 'approved',
        schemaFamily: 'video',
        version: 'synthetic-output-v1',
      },
    ],
    reviewedProviderContractVersion: 'synthetic-output-v1',
  });
  const service = new WorkflowMediaBillingPlanService(
    preparation,
    route,
    { model: { findFirst } } as unknown as PrismaService,
    quotes,
  );
  return { reference, service };
}

describe('motion control funding is priced from the measured reference', () => {
  it('freezes the measured seconds into the quote, and a longer reference costs more', async () => {
    const short = await fixture({ seconds: 5 }).service.prepareAllocation(
      motionArgs(),
    );
    const long = await fixture({ seconds: 10 }).service.prepareAllocation(
      motionArgs(),
    );

    expect(short.allocation.dispatch.quantities).toMatchObject({ duration: 5 });
    expect(long.allocation.dispatch.quantities).toMatchObject({ duration: 10 });
    expect(long.allocation.quote?.credits).toBeGreaterThan(
      short.allocation.quote?.credits ?? Number.POSITIVE_INFINITY,
    );
    expect(short.allocation).toMatchObject({
      actionId: 'motionControl',
      billingMode: 'credits',
    });
    expect(short.allocation.quote?.quantities.referenceEvidenceHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('charges the pro tariff above the standard one for the same reference', async () => {
    const f = fixture();
    const std = await f.service.prepareAllocation(
      motionArgs({ qualityMode: 'std' }),
    );
    const pro = await f.service.prepareAllocation(
      motionArgs({ qualityMode: 'pro' }),
    );

    expect(pro.allocation.quote?.credits).toBeGreaterThan(
      std.allocation.quote?.credits ?? Number.POSITIVE_INFINITY,
    );
  });

  it('dispatches when the reference is the one that was quoted', async () => {
    const f = fixture();
    const args = motionArgs();
    const planned = await f.service.prepareAllocation(args);

    const validated = await f.service.validateDispatch(
      dispatchInput(planned.allocation, args),
    );

    expect(validated.prepared.input).toEqual(planned.prepared.input);
    expect(validated.dispatchFingerprint).toBe(
      planned.allocation.dispatch.billableFingerprint,
    );
  });

  it('refuses to dispatch when the reference now runs longer than the hold covers', async () => {
    const f = fixture({ seconds: 5 });
    const args = motionArgs();
    const planned = await f.service.prepareAllocation(args);
    f.reference.seconds = 9;

    await expect(
      f.service.validateDispatch(dispatchInput(planned.allocation, args)),
    ).rejects.toThrow('Workflow final billable quantities changed');
  });

  it('refuses to dispatch when the reference file was replaced by one of the same length', async () => {
    const f = fixture();
    const args = motionArgs();
    const planned = await f.service.prepareAllocation(args);
    f.reference.hash = 'b'.repeat(64);

    await expect(
      f.service.validateDispatch(dispatchInput(planned.allocation, args)),
    ).rejects.toThrow('Workflow final billable quantities changed');
  });

  it('runs on the customer key without a credit quote', async () => {
    const f = fixture({ byok: true });
    const args = motionArgs();

    const planned = await f.service.prepareAllocation(args);

    expect(planned.allocation).toMatchObject({
      actionId: 'motionControl',
      billingMode: 'byok',
    });
    expect(planned.allocation.quote).toBeUndefined();
    await expect(
      f.service.validateDispatch(dispatchInput(planned.allocation, args)),
    ).resolves.toMatchObject({
      credential: { apiKey: 'byok-secret', credentialId: 'key-1' },
    });
  });
});
