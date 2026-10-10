import { WorkflowFalOutputFinalizationService } from '@api/collections/workflows/services/workflow-fal-output-finalization.service';
import { IngredientStatus } from '@genfeedai/contracts';
import { WorkflowNodeContinuationStatus } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/helpers/utils/credits/workflow-generation-billing.schema',
  () => ({
    workflowExecutionGenerationBillingSchema: {
      parse: (value: unknown) => value,
    },
  }),
);
vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock(
  '@api/collections/workflows/services/workflow-node-continuation.service',
  () => ({ WorkflowNodeContinuationService: class {} }),
);
vi.mock('@api/endpoints/webhooks/webhooks.service', () => ({
  WebhooksService: class {},
}));
vi.mock('@api/collections/metadata/services/metadata.service', () => ({
  MetadataService: class {},
}));
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@libs/logger/logger.service', () => ({ LoggerService: class {} }));

describe('accepted Fal file finalization recovery', () => {
  function fixture() {
    const row = {
      id: 'continuation',
      organizationId: 'org',
      externalId: 'https://fal.test/result.mp4',
      ingredientId: 'output',
      executionId: 'execution',
      workflowVersionId: 'version',
      nodeId: 'node',
      actionId: 'videoGen',
      status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
      updatedAt: new Date(),
      providerResult: {
        acceptedFalOutput: { externalId: 'https://fal.test/result.mp4' },
      },
    };
    const ingredient = {
      id: 'output',
      s3Key: 'outputs/video.mp4',
      status: IngredientStatus.PROCESSING,
      metadata: {
        id: 'metadata',
        width: 1280,
        height: 720,
        duration: 8,
        size: 1000,
      },
    };
    const prisma = {
      workflowNodeContinuation: {
        findFirst: vi.fn().mockResolvedValue(row),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'continuation', organizationId: 'org' }]),
      },
      ingredient: { findFirst: vi.fn().mockResolvedValue(ingredient) },
      workflowExecution: {
        findFirst: vi.fn().mockResolvedValue({
          generationBilling: {
            manifest: {
              executionId: 'execution',
              organizationId: 'org',
              allocations: [
                {
                  nodeId: 'node',
                  actionId: 'videoGen',
                  dispatch: {
                    provider: 'fal',
                    quantities: {
                      width: 1280,
                      height: 720,
                      duration: 8,
                      framesPerSecond: 24,
                    },
                  },
                },
              ],
            },
          },
        }),
      },
    };
    const files = {
      getPresignedDownloadUrlForObjectKey: vi
        .fn()
        .mockResolvedValue('https://stored.test/video.mp4'),
      fingerprintMedia: vi
        .fn()
        .mockResolvedValue({ assetHash: 'a'.repeat(64), sizeBytes: 1000 }),
      probeMediaFromUrl: vi.fn().mockResolvedValue({
        width: 1280,
        height: 720,
        durationSeconds: 8,
        frameRate: 24,
        sizeBytes: 1000,
      }),
    };
    const continuations = {
      recordFalOutputMeasurement: vi.fn(),
      recordProviderSettlement: vi.fn(),
    };
    const webhooks = {
      processMediaForIngredient: vi.fn(
        async (_id, _category, _url, _external, observer) => {
          await observer.beforeFinalize({
            s3Key: ingredient.s3Key,
            ...ingredient.metadata,
          });
          ingredient.status = IngredientStatus.GENERATED;
        },
      ),
    };
    const metadata = { patch: vi.fn() };
    const logger = { error: vi.fn() };
    return {
      row,
      ingredient,
      prisma,
      files,
      continuations,
      webhooks,
      logger,
      service: new WorkflowFalOutputFinalizationService(
        prisma as never,
        continuations as never,
        files as never,
        webhooks as never,
        metadata as never,
        logger as never,
      ),
    };
  }
  beforeEach(() => vi.clearAllMocks());
  it('measures the stored file before recording exact continuation success', async () => {
    const f = fixture();
    await expect(f.service.finalize('continuation', 'org')).resolves.toBe(true);
    expect(f.prisma.workflowNodeContinuation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'continuation',
          organizationId: 'org',
          provider: 'fal',
          status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
        }),
      }),
    );
    expect(f.continuations.recordFalOutputMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientId: 'output',
        externalId: f.row.externalId,
        measurement: expect.objectContaining({
          assetKey: 'outputs/video.mp4',
          assetHash: 'a'.repeat(64),
          duration: 8,
        }),
      }),
    );
    expect(f.continuations.recordProviderSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: { continuationId: 'continuation', organizationId: 'org' },
        succeeded: true,
      }),
    );
  });
  it('recovers a file error on the same accepted identity without any provider submission', async () => {
    const f = fixture();
    f.webhooks.processMediaForIngredient.mockRejectedValueOnce(
      new Error('File storage unavailable'),
    );
    await expect(f.service.finalize('continuation', 'org')).resolves.toBe(
      false,
    );
    expect(f.continuations.recordProviderSettlement).not.toHaveBeenCalled();
    await expect(f.service.finalize('continuation', 'org')).resolves.toBe(true);
    expect(f.webhooks.processMediaForIngredient).toHaveBeenCalledTimes(2);
  });
  it('recovers a crash after storage without uploading an already completed output again', async () => {
    const f = fixture();
    f.ingredient.status = IngredientStatus.GENERATED;
    await expect(f.service.finalize('continuation', 'org')).resolves.toBe(true);
    expect(f.webhooks.processMediaForIngredient).not.toHaveBeenCalled();
    expect(f.continuations.recordProviderSettlement).toHaveBeenCalledOnce();
  });
  it('keeps an accepted output recoverable if storage finalization loses ownership', async () => {
    const f = fixture();
    f.webhooks.processMediaForIngredient.mockResolvedValueOnce(undefined);
    await expect(f.service.finalize('continuation', 'org')).resolves.toBe(
      false,
    );
    expect(f.continuations.recordProviderSettlement).not.toHaveBeenCalled();
  });
  it('does not turn an accepted completion into a failure when lease cleanup is unavailable', async () => {
    const f = fixture();
    f.prisma.workflowNodeContinuation.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('Lease cleanup unavailable'));
    await expect(f.service.finalize('continuation', 'org')).resolves.toBe(true);
    expect(f.continuations.recordProviderSettlement).toHaveBeenCalledOnce();
    expect(f.logger.error).toHaveBeenCalled();
  });
  it('does not ingest after a lost compare-and-set claim', async () => {
    const f = fixture();
    f.prisma.workflowNodeContinuation.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await expect(f.service.finalize('continuation', 'org')).resolves.toBe(
      false,
    );
    expect(f.webhooks.processMediaForIngredient).not.toHaveBeenCalled();
  });
  it('does not report success when stored bytes change or exceed the frozen duration', async () => {
    const f = fixture();
    f.files.probeMediaFromUrl.mockResolvedValueOnce({
      width: 1280,
      height: 720,
      durationSeconds: 30,
      frameRate: 24,
      sizeBytes: 1000,
    });
    await expect(f.service.finalize('continuation', 'org')).resolves.toBe(
      false,
    );
    expect(f.continuations.recordProviderSettlement).not.toHaveBeenCalled();
  });
});
