import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import {
  type WorkflowMediaAllocationInput,
  WorkflowMediaBillingPlanService,
  type WorkflowMediaDispatchInput,
} from '@api/collections/workflows/services/workflow-media-billing-plan.service';
import { WorkflowMediaCredentialRouteService } from '@api/collections/workflows/services/workflow-media-credential-route.service';
import { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { workflowFundingFixture } from '@api/helpers/utils/credits/workflow-generation-funding.fixture';
import type { ByokService } from '@api/services/byok/byok.service';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { WorkflowGenerationNodeAllocation } from '@genfeedai/contracts/interfaces/billing';
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
vi.mock('@api/services/prompt-builder/prompt-builder.service', () => ({
  PromptBuilderService: class {},
}));
vi.mock('@libs/logger/logger.service', () => ({ LoggerService: class {} }));
const key = MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL;
const args: WorkflowMediaAllocationInput = {
  executionId: 'execution-1',
  node: createExecutableActionNode({
    actionId: 'imageGen',
    id: 'node-1',
    parameters: { model: key, brandId: 'brand-1', prompt: 'A lighthouse' },
  }),
  inputs: new Map(),
  context: {
    executionId: 'execution-1',
    organizationId: 'org-1',
    userId: 'user-1',
    workflowId: 'workflow-1',
    workflowVersionId: 'version-1',
    runId: 'run-1',
  },
};
const failure = expect.objectContaining({
  response: expect.objectContaining({ detail: expect.any(String) }),
});
function dispatchInput(
  allocation: WorkflowGenerationNodeAllocation,
  input: WorkflowMediaAllocationInput = args,
): WorkflowMediaDispatchInput {
  const funding = workflowFundingFixture(args.executionId);
  funding.manifest.organizationId = args.context.organizationId;
  funding.manifest.actorUserId = args.context.userId;
  funding.manifest.workflowVersionId = args.context.workflowVersionId;
  funding.manifest.selectedNodeIds = [args.node.id];
  funding.manifest.allocations = [allocation];
  funding.manifestHash = quoteSnapshotHash(funding.manifest);
  funding.holdAmount = String(allocation.quote?.credits ?? 0);
  funding.operations = [
    { operationId: allocation.operationId, phase: 'unclaimed' },
  ];
  return {
    ...input,
    context: { ...input.context, executionId: input.context.executionId ?? '' },
    funding,
    operationId: allocation.operationId,
  };
}
function fixture(byok = false) {
  const lookupApiKeyWithIdentity = vi
    .fn()
    .mockResolvedValue(
      byok ? { credentialId: 'key-1', apiKey: 'byok-secret' } : undefined,
    );
  const route = new WorkflowMediaCredentialRouteService({
    lookupApiKeyWithIdentity,
  } as unknown as ByokService);
  const helper = {
    requireBrandId: (brand: unknown) => String(brand),
    extractIngredientId: () => undefined,
  } as unknown as WorkflowEngineExecutorHelperService;
  const preparation = new WorkflowMediaProviderPlanService(
    helper,
    {} as LoggerService,
    personasServiceStub(),
    { buildPrompt: vi.fn() } as unknown as PromptBuilderService,
  );
  let profile = billableProfile({ key, cost: 5 });
  const findBillablePricingProfile = vi.fn(async () => profile);
  const quoteService = new ModelCreditQuoteService({
    findBillablePricingProfile,
  } as unknown as ModelsService);
  const quoteSnapshotByKey = vi.spyOn(quoteService, 'quoteSnapshotByKey');
  const findFirst = vi.fn().mockResolvedValue({
    id: 'model-1',
    key,
    provider: 'replicate',
    endpoint: key,
    isActive: true,
    isDeleted: false,
    reviewedProviderContractVersion: 'synthetic-output-v1',
    providerContracts: [
      {
        modelId: 'model-1',
        provider: 'replicate',
        endpoint: key,
        version: 'synthetic-output-v1',
        reviewStatus: 'approved',
        mappingStatus: 'supported',
        inputSchema: {
          type: 'object',
          properties: {
            num_outputs: { type: 'integer', minimum: 1, maximum: 4 },
          },
        },
        outputSchema: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
          'x-genfeed-output-count-input': 'num_outputs',
        },
        openapi: {},
        pricing: [],
        schemaFamily: 'image',
      },
    ],
  });
  const service = new WorkflowMediaBillingPlanService(
    preparation,
    route,
    { model: { findFirst } } as unknown as PrismaService,
    quoteService,
  );
  return {
    service,
    preparation,
    findFirst,
    lookupApiKeyWithIdentity,
    quoteSnapshotByKey,
    findBillablePricingProfile,
    setProfile: (next: typeof profile) => {
      profile = next;
    },
  };
}

describe('server-owned single-operation workflow media billing compiler', () => {
  it('quotes the actual shared compiled input and validates with the frozen profile after the current tariff changes', async () => {
    const f = fixture();
    const planned = await f.service.prepareAllocation(args);
    expect(f.quoteSnapshotByKey).toHaveBeenCalledWith(
      key,
      expect.objectContaining({
        providerInput: planned.prepared.input,
        requests: 1,
        outputs: 1,
        provider: 'replicate',
      }),
      undefined,
    );
    expect(planned.allocation.quote?.credits).toBe(5);
    expect(planned.allocation.dispatch.projectionPolicy).toEqual({
      kind: 'frozen-pricing-profile',
      version: 1,
    });
    f.setProfile(billableProfile({ key, cost: 999 }));
    f.quoteSnapshotByKey.mockClear();
    f.findFirst.mockClear();
    f.findBillablePricingProfile.mockClear();
    f.lookupApiKeyWithIdentity.mockClear();
    const validated = await f.service.validateDispatch(
      dispatchInput(planned.allocation),
    );
    expect(validated.prepared.input).toEqual(planned.prepared.input);
    expect(validated.dispatchFingerprint).toBe(
      planned.allocation.dispatch.billableFingerprint,
    );
    expect(validated.credential).toBeUndefined();
    expect(f.quoteSnapshotByKey).not.toHaveBeenCalled();
    expect(f.findFirst).not.toHaveBeenCalled();
    expect(f.findBillablePricingProfile).not.toHaveBeenCalled();
    expect(f.lookupApiKeyWithIdentity).not.toHaveBeenCalled();
  });
  it('pins BYOK without a tariff, quote or guessed selector policy', async () => {
    const f = fixture(true);
    f.findBillablePricingProfile.mockRejectedValue(
      new Error('tariff unavailable'),
    );
    const planned = await f.service.prepareAllocation(args);
    expect(planned.allocation.billingMode).toBe('byok');
    expect(planned.allocation.quote).toBeUndefined();
    expect(planned.allocation.dispatch.projectionPolicy.kind).toBe(
      'exact-provider-input',
    );
    expect(planned.allocation.dispatch.quantities).not.toHaveProperty(
      'selectors',
    );
    expect(
      (await f.service.validateDispatch(dispatchInput(planned.allocation)))
        .credential,
    ).toEqual({ credentialId: 'key-1', apiKey: 'byok-secret' });
    expect(f.quoteSnapshotByKey).not.toHaveBeenCalled();
    expect(f.findBillablePricingProfile).not.toHaveBeenCalled();
  });
  it.each(['changed', 'added', 'removed'] as const)(
    'rejects %s BYOK final input before credential dispatch resolution',
    async (change) => {
      const f = fixture(true);
      const planned = await f.service.prepareAllocation(args);
      const input = { ...planned.prepared.input };
      if (change === 'changed') input.prompt = 'different';
      if (change === 'added') input.extra = true;
      if (change === 'removed') delete input.prompt;
      vi.spyOn(f.preparation, 'prepareNode').mockResolvedValue({
        ...planned.prepared,
        input,
      });
      f.lookupApiKeyWithIdentity.mockClear();
      await expect(
        f.service.validateDispatch(dispatchInput(planned.allocation)),
      ).rejects.toThrow(failure);
      expect(f.lookupApiKeyWithIdentity).not.toHaveBeenCalled();
    },
  );
  it('does not fall back to platform when a pinned BYOK key rotates', async () => {
    const f = fixture(true);
    const planned = await f.service.prepareAllocation(args);
    f.lookupApiKeyWithIdentity.mockResolvedValue({
      credentialId: 'key-2',
      apiKey: 'replacement',
    });
    await expect(
      f.service.validateDispatch(dispatchInput(planned.allocation)),
    ).rejects.toThrow(failure);
    expect(f.quoteSnapshotByKey).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'rejects the actual Seedance native extension duration -1 before funding either route, BYOK=%s',
    async (byok) => {
      const f = fixture(byok);
      const video = {
        ...args,
        node: createExecutableActionNode({
          actionId: 'videoGen',
          id: 'video-1',
          parameters: {
            model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
            brandId: 'brand-1',
            prompt: 'extend',
            actionVerb: 'extend',
            duration: 8,
          },
        }),
        inputs: new Map([['videoReference', 'https://public.test/source.mp4']]),
      };
      await expect(f.service.prepareAllocation(video)).rejects.toThrow(failure);
      expect(f.findFirst).not.toHaveBeenCalled();
      expect(f.lookupApiKeyWithIdentity).not.toHaveBeenCalled();
      expect(f.quoteSnapshotByKey).not.toHaveBeenCalled();
    },
  );
  it('allows request pricing without invented dimensions and rejects megapixel pricing when actual dimensions are absent', async () => {
    const f = fixture();
    const planned = await f.service.prepareAllocation(args);
    expect(planned.prepared.input).not.toHaveProperty('width');
    expect(planned.allocation.dispatch.quantities).not.toHaveProperty('width');
    f.setProfile(
      billableProfile({ key, pricingType: 'per-megapixel', costPerUnit: 1 }),
    );
    await expect(f.service.prepareAllocation(args)).rejects.toThrow();
  });
  it('rejects compiler/profile drift and a modified contract hash even if the outer dispatch fingerprint is updated', async () => {
    const f = fixture();
    const planned = await f.service.prepareAllocation(args);
    const changed = structuredClone(planned.allocation);
    if (!('compilerVersion' in changed.dispatch.preparationContract.brief)) throw new Error('Expected compiled brief fixture');
    changed.dispatch.preparationContract.brief.compilerVersion++;
    changed.dispatch.billableFingerprint = quoteSnapshotHash({
      ...changed.dispatch,
      billableFingerprint: undefined,
    });
    await expect(
      f.service.validateDispatch(dispatchInput(changed)),
    ).rejects.toThrow(failure);
    if (planned.prepared.actionId !== 'imageGen')
      throw new Error('fixture must prepare an image');
    const evidence = planned.prepared.generationBriefEvidence;
    if (evidence.status !== 'compiled') throw new Error('fixture must compile');
    vi.spyOn(f.preparation, 'prepareNode').mockResolvedValue({
      ...planned.prepared,
      generationBriefEvidence: {
        ...evidence,
        profileVersion: evidence.profileVersion + 1,
      },
    });
    await expect(
      f.service.validateDispatch(dispatchInput(planned.allocation)),
    ).rejects.toThrow(failure);
  });
  it('rejects an unannotated array and an exempt or different model instead of inventing provider contracts', async () => {
    const f = fixture();
    f.findFirst.mockResolvedValue({
      id: 'model-1',
      key,
      provider: 'replicate',
      endpoint: key,
      isActive: true,
      isDeleted: false,
      reviewedProviderContractVersion: 'synthetic-output-v1',
      providerContracts: [
        {
          modelId: 'model-1',
          provider: 'replicate',
          endpoint: key,
          version: 'synthetic-output-v1',
          reviewStatus: 'approved',
          mappingStatus: 'supported',
          inputSchema: {},
          outputSchema: {
            type: 'array',
            items: { type: 'string', format: 'uri' },
          },
          openapi: {},
          pricing: [],
          schemaFamily: 'image',
        },
      ],
    });
    await expect(f.service.prepareAllocation(args)).rejects.toThrow(failure);
    expect(f.quoteSnapshotByKey).not.toHaveBeenCalled();
    const unsupported = {
      ...args,
      node: createExecutableActionNode({
        actionId: 'videoGen',
        id: 'unknown-1',
        parameters: { model: 'unknown/video', brandId: 'brand-1' },
      }),
    };
    await expect(f.service.prepareAllocation(unsupported)).rejects.toThrow(
      failure,
    );
  });
  it.each([
    'executionId',
    'contextExecutionId',
    'organizationId',
    'userId',
    'workflowVersionId',
    'selectedNode',
    'operationId',
    'actionId',
  ] as const)(
    'rejects frozen owner or graph mismatch %s before preparation or credentials',
    async (field) => {
      const f = fixture(true);
      const planned = await f.service.prepareAllocation(args);
      const input = dispatchInput(planned.allocation);
      if (field === 'executionId') input.executionId = 'foreign-execution';
      else if (field === 'contextExecutionId')
        input.context.executionId = 'foreign-execution';
      else if (field === 'selectedNode')
        input.node = { ...args.node, id: 'foreign-node' };
      else if (field === 'operationId') input.operationId = '0'.repeat(64);
      else if (field === 'actionId')
        input.node = createExecutableActionNode({
          id: args.node.id,
          actionId: 'videoGen',
        });
      else input.context[field] = 'foreign-owner';
      const prepare = vi.spyOn(f.preparation, 'prepareNode');
      prepare.mockClear();
      f.lookupApiKeyWithIdentity.mockClear();
      f.findFirst.mockClear();
      await expect(f.service.validateDispatch(input)).rejects.toThrow(failure);
      expect(prepare).not.toHaveBeenCalled();
      expect(f.lookupApiKeyWithIdentity).not.toHaveBeenCalled();
      expect(f.findFirst).not.toHaveBeenCalled();
    },
  );
  it('rejects an internally valid foreign funding plan even when its BYOK credential identity is the same', async () => {
    const f = fixture(true);
    const foreign = {
      ...args,
      executionId: 'foreign-execution',
      context: {
        ...args.context,
        executionId: 'foreign-execution',
        organizationId: 'foreign-org',
      },
    };
    const planned = await f.service.prepareAllocation(foreign);
    const input = dispatchInput(planned.allocation);
    input.funding.manifest.executionId = foreign.executionId;
    input.funding.manifest.organizationId = foreign.context.organizationId;
    input.funding.manifestHash = quoteSnapshotHash(input.funding.manifest);
    const prepare = vi.spyOn(f.preparation, 'prepareNode');
    prepare.mockClear();
    f.lookupApiKeyWithIdentity.mockClear();
    await expect(f.service.validateDispatch(input)).rejects.toThrow(failure);
    expect(prepare).not.toHaveBeenCalled();
    expect(f.lookupApiKeyWithIdentity).not.toHaveBeenCalled();
  });
  it.each(['organizationId', 'userId'] as const)(
    'rejects prepared output owner drift %s before credential resolution',
    async (field) => {
      const f = fixture(true);
      const planned = await f.service.prepareAllocation(args);
      vi.spyOn(f.preparation, 'prepareNode').mockResolvedValue({
        ...planned.prepared,
        output: { ...planned.prepared.output, [field]: 'foreign-owner' },
      });
      f.lookupApiKeyWithIdentity.mockClear();
      await expect(
        f.service.validateDispatch(dispatchInput(planned.allocation)),
      ).rejects.toThrow(failure);
      expect(f.lookupApiKeyWithIdentity).not.toHaveBeenCalled();
    },
  );
  it('rejects unsupported actions and mismatched operation identity before provider dispatch', async () => {
    const f = fixture();
    await expect(
      f.service.prepareAllocation({
        ...args,
        node: createExecutableActionNode({
          actionId: 'upscale',
          id: 'upscale-1',
        }),
      }),
    ).rejects.toThrow('No direct media preparation contract');
    const planned = await f.service.prepareAllocation(args);
    await expect(
      f.service.validateDispatch(
        dispatchInput(planned.allocation, {
          ...args,
          executionId: 'another-execution',
        }),
      ),
    ).rejects.toThrow(failure);
  });
});
