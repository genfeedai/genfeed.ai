import type { BreakoutGenerationAdmission } from '@api/collections/outliers/services/breakout-generation-admission.util';
import {
  type BreakoutMediaOutputGenerationRequest,
  BreakoutMediaOutputGenerationService,
} from '@api/collections/outliers/services/breakout-media-output-generation.service';
import type {
  AgentGenerationInput,
  IAgentGenerationGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import type { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import type { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Platform } from '@genfeedai/contracts';
import { IngredientStatus, type Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-generation-admission.util',
  () => ({
    admitBreakoutGenerationContinuation: vi.fn(async () => undefined),
    runWithBreakoutGenerationAdmission: async <T>(
      _tx: unknown,
      _admission: unknown,
      run: () => Promise<T>,
    ) => run(),
  }),
);

function fixture(format: 'image' | 'carousel' | 'video' | 'short' = 'image') {
  const reauthorize = vi.fn(async (_tx: Prisma.TransactionClient) => undefined);
  const admission: BreakoutGenerationAdmission = {
    scope: {
      version: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      strategyId: 'strategy-a',
      platform: Platform.INSTAGRAM,
      format,
    },
    credentialId: 'account-a',
    responseId: 'response-a',
    outputId: 'output-a',
    actorUserId: 'user-a',
    workflowExecutionId: 'execution-a',
    componentKey: 'generation-a:media:1',
    reauthorize,
  };
  const request: BreakoutMediaOutputGenerationRequest = {
    admission,
    provider: 'fixture-media-provider',
    prompts:
      format === 'carousel'
        ? ['First visual', 'Second visual']
        : ['One original visual'],
    settings: {
      model:
        format === 'video' || format === 'short'
          ? 'replicate/video-model'
          : 'replicate/image-model',
      width: 1080,
      height: 1920,
    },
  };
  let state = 'reserved';
  type Asset = {
    id: string;
    groupIndex: number;
    sourceActionId: string;
    status: IngredientStatus;
    s3Key: string | null;
    version: number;
  };
  const assets: Asset[] = [];
  const tx = {
    breakoutResponseOutput: {
      findFirst: vi.fn(async () => ({ generationKey: 'generation-a', state })),
      updateMany: vi.fn(
        async (args: Prisma.BreakoutResponseOutputUpdateManyArgs) => {
          const won = state === args.where?.state;
          if (won && typeof args.data.state === 'string')
            state = args.data.state;
          return { count: won ? 1 : 0 };
        },
      ),
    },
    ingredient: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => [...assets]),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) =>
        run(tx as unknown as Prisma.TransactionClient),
    ),
  };
  const produce = async (input: AgentGenerationInput) => {
    const key = input.body.sourceActionId;
    if (typeof key !== 'string')
      throw new Error('missing actual component identity');
    const index = Number(key.split(':').at(-1)) - 1;
    const id = `asset-${index}`;
    await input.onPlaceholderCreated?.(id);
    assets.push({
      id,
      groupIndex: index,
      sourceActionId: key,
      status: IngredientStatus.GENERATED,
      s3Key: `generated/${id}`,
      version: 1,
    });
    return { data: { id, type: 'ingredients', attributes: {} } };
  };
  const gateway = {
    generateImage: vi.fn(produce),
    generateVideo: vi.fn(produce),
  };
  const snapshots = {
    preview: vi.fn(async () => ({ contentHash: 'fixture-snapshot' })),
  };
  const brandValidation = {
    preflightBrandCapabilities: vi.fn<
      BrandValidationService['preflightBrandCapabilities']
    >(() => ({ status: 'supported', diagnostics: [] })),
  };
  const service = new BreakoutMediaOutputGenerationService(
    prisma as unknown as PrismaService,
    gateway as unknown as IAgentGenerationGateway,
    snapshots as unknown as BrandIdentitySnapshotService,
    brandValidation as unknown as BrandValidationService,
  );
  return {
    service,
    request,
    gateway,
    prisma,
    tx,
    reauthorize,
    assets,
    snapshots,
    brandValidation,
    setState: (value: string) => {
      state = value;
    },
  };
}

describe('breakout normal media provider consumer', () => {
  beforeEach(() => vi.clearAllMocks());
  it('holds unavailable brand rendering before claiming an output, reading assets or starting paid provider work', async () => {
    const h = fixture();
    h.brandValidation.preflightBrandCapabilities.mockReturnValue({
      status: 'blocked',
      diagnostics: [
        {
          code: 'artifact_media_unsupported',
          severity: 'error',
          message: 'No qualified renderer',
        },
      ],
    });
    await expect(h.service.generate(h.request)).rejects.toThrow(
      'brand_capability_unavailable',
    );
    expect(h.tx.breakoutResponseOutput.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'output-a',
        organizationId: 'org-a',
        brandId: 'brand-a',
        credentialId: 'account-a',
        responseId: 'response-a',
        workflowExecutionId: 'execution-a',
        format: 'image',
        isDeleted: false,
        state: 'reserved',
      },
      data: { heldReason: 'media_brand_capability_unavailable' },
    });
    expect(h.tx.ingredient.findMany).not.toHaveBeenCalled();
    expect(h.gateway.generateImage).not.toHaveBeenCalled();
  });
  it.each(['image', 'carousel', 'video', 'short'] as const)(
    'uses actual %s endpoint generation and scoped ordered retained ingredients',
    async (format) => {
      const h = fixture(format);
      const result = await h.service.generate(h.request);
      expect(result).toEqual({
        state: 'ready',
        ingredientIds: h.assets.map((asset) => asset.id),
      });
      const method =
        format === 'image' || format === 'carousel'
          ? h.gateway.generateImage
          : h.gateway.generateVideo;
      const other =
        format === 'image' || format === 'carousel'
          ? h.gateway.generateVideo
          : h.gateway.generateImage;
      expect(method).toHaveBeenCalledTimes(h.request.prompts.length);
      expect(other).not.toHaveBeenCalled();
      expect(method).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          body: expect.objectContaining({
            sourceActionId: 'generation-a:media:1',
            brandId: 'brand-a',
            model: h.request.settings.model,
          }),
          principal: {
            organizationId: 'org-a',
            brandId: 'brand-a',
            userId: 'user-a',
          },
        }),
      );
      expect(h.tx.ingredient.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-a',
            brandId: 'brand-a',
            userId: 'user-a',
            isDeleted: false,
            sourceActionId: 'generation-a:media:1',
          }),
          data: expect.objectContaining({
            agentStrategyId: 'strategy-a',
            workflowExecutionId: 'execution-a',
            groupId: 'generation-a',
            groupIndex: 0,
          }),
        }),
      );
    },
  );
  it('admits one provider cascade when two workers reach the same output concurrently', async () => {
    const h = fixture('carousel');
    await Promise.all([
      h.service.generate(h.request),
      h.service.generate(h.request),
    ]);
    expect(h.gateway.generateImage).toHaveBeenCalledTimes(2);
    expect(h.assets).toHaveLength(2);
  });
  it('does not resubmit a missing or failed component after an interrupted cascade', async () => {
    const h = fixture('carousel');
    h.setState('generating');
    h.assets.push({
      id: 'asset-0',
      groupIndex: 0,
      sourceActionId: 'generation-a:media:1',
      status: IngredientStatus.FAILED,
      s3Key: null,
      version: 1,
    });
    expect(await h.service.generate(h.request)).toEqual({
      state: 'reconciliation_required',
      ingredientIds: ['asset-0'],
    });
    expect(h.gateway.generateImage).not.toHaveBeenCalled();
    expect(h.tx.ingredient.updateMany).not.toHaveBeenCalled();
  });
  it('keeps accepted provider work in progress without fabricating a render or repeating generation', async () => {
    const h = fixture();
    h.setState('generating');
    h.assets.push({
      id: 'asset-0',
      groupIndex: 0,
      sourceActionId: 'generation-a:media:1',
      status: IngredientStatus.PROCESSING,
      s3Key: null,
      version: 1,
    });
    expect(await h.service.generate(h.request)).toEqual({
      state: 'processing',
      ingredientIds: ['asset-0'],
    });
    expect(h.gateway.generateImage).not.toHaveBeenCalled();
  });
  it('propagates native revocation before private output reads and never infers its creator as the actor', async () => {
    const h = fixture();
    const denied = new Error('key_revoked');
    h.reauthorize.mockRejectedValue(denied);
    await expect(h.service.generate(h.request)).rejects.toBe(denied);
    expect(h.tx.breakoutResponseOutput.findFirst).not.toHaveBeenCalled();
    expect(h.gateway.generateImage).not.toHaveBeenCalled();
  });
  it('never spreads customer-shaped provider, billing or authority fields into a normal generation request', async () => {
    const h = fixture();
    Object.assign(h.request.settings, {
      generationProvider: { paid: true },
      generationBilling: { bypass: true },
      sourceActionId: 'customer',
      brandId: 'foreign',
      actorId: 'creator',
    });
    await h.service.generate(h.request);
    const body = h.gateway.generateImage.mock.calls[0]?.[0].body;
    expect(body).not.toHaveProperty('generationProvider');
    expect(body).not.toHaveProperty('generationBilling');
    expect(body).not.toHaveProperty('actorId');
    expect(body).toMatchObject({
      brandId: 'brand-a',
      sourceActionId: 'generation-a:media:1',
    });
  });
});
