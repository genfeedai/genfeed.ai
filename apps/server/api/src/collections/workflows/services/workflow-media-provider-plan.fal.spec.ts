import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { IngredientCategory } from '@genfeedai/contracts';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import {
  createExecutableActionNode,
  type ExecutionContext,
} from '@genfeedai/workflows/engine';
import type { LoggerService } from '@libs/logger/logger.service';
import { hashProviderContract } from '@libs/utils/provider-contract.util';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflows/services/workflow-engine-executor-helper.service',
  () => ({ WorkflowEngineExecutorHelperService: class {} }),
);
vi.mock('@api/services/integrations/fal/services/fal.service', () => ({
  FalService: class {},
}));
vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@libs/logger/logger.service', () => ({ LoggerService: class {} }));

const context: ExecutionContext = {
  organizationId: 'org-1',
  userId: 'user-1',
  runId: 'run-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};
function fixture() {
  const raw = {
    endpoint: 'bytedance/seedance-2.5/reference-to-video',
    schemaFamily: 'video-reference-v1',
    inputSchema: {
      type: 'object',
      required: ['prompt', 'duration'],
      properties: {
        prompt: { type: 'string' },
        duration: { type: 'string', enum: ['6', '8'] },
        resolution: { type: 'string', const: '480p' },
        aspect_ratio: { type: 'string', enum: ['16:9', 'auto'] },
        task: { type: 'string', enum: ['extension', 'editing'] },
        image_urls: { type: 'array', items: { type: 'string' } },
        video_urls: { type: 'array', items: { type: 'string' } },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['video'],
      properties: {
        video: {
          type: 'object',
          required: ['url'],
          properties: { url: { type: 'string', format: 'uri' } },
        },
      },
    },
    openapi: null,
    pricing: null,
  };
  const snapshot = {
    ...raw,
    modelId: 'model-1',
    provider: 'fal',
    version: hashProviderContract(raw),
    reviewStatus: 'approved',
    mappingStatus: 'supported',
  };
  const model = {
    id: 'model-1',
    key: `fal/${raw.endpoint}`,
    endpoint: raw.endpoint,
    provider: 'fal',
    isActive: true,
    isDeleted: false,
    reviewedProviderContractVersion: snapshot.version,
    providerContracts: [snapshot],
  };
  const findFirst = vi.fn().mockResolvedValue(model);
  const effects = {
    createWorkflowOutputIngredient: vi.fn(),
    createAndLinkProcessingOutput: vi.fn(),
    createProviderContinuation: vi.fn(),
  };
  const helper = {
    ...effects,
    requireBrandId: (value: unknown) => String(value),
    hasOrganizationAsset: vi.fn().mockResolvedValue(true),
    extractIngredientId: (value: unknown) =>
      typeof value === 'string'
        ? value.match(/\/(?:videos|images)\/([^/?#]+)/)?.[1]
        : undefined,
  } as unknown as WorkflowEngineExecutorHelperService;
  const personas = personasServiceStub();
  const findStoredVideo = vi.fn().mockResolvedValue({ s3Key: 'videos/source-1.mp4' });
  const files = {
    getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://stored.test/source.mp4'),
    getPresignedDownloadUrlForObjectKey: vi.fn().mockResolvedValue('https://stored.test/source.mp4'),
    fingerprintMedia: vi.fn().mockResolvedValue({ assetHash: 'a'.repeat(64), sizeBytes: 1000 }),
    probeMediaFromUrl: vi.fn().mockResolvedValue({ sizeBytes: 1000, durationSeconds: 3, width: 864, height: 496, frameRate: 24 }),
  };
  const prisma = { model: { findFirst }, ingredient: { findFirst: findStoredVideo } } as unknown as PrismaService;
  const service = new WorkflowMediaProviderPlanService(
    helper,
    { warn: vi.fn() } as unknown as LoggerService,
    personas,
    undefined,
    files as unknown as FilesClientService,
    undefined,
    undefined,
    prisma,
  );
  const prepare = (params: Record<string, unknown> = {}) =>
    service.prepareVideo({
      model: model.key,
      params: {
        brandId: 'brand-1',
        prompt: 'Continue the scene',
        duration: 6,
        resolution: '1080p',
        aspect_ratio: '16:9',
        ...params,
      },
      context,
      node: createExecutableActionNode({
        id: 'video-1',
        actionId: 'videoGen',
        parameters: {},
      }),
    });
  return {
    raw,
    snapshot,
    model,
    findFirst,
    prepare,
    effects,
    personas,
    service,
    files,
    findStoredVideo,
  };
}

describe('reviewed Fal workflow provider preparation', () => {
  it('prepares the real published adapter input and exact endpoint without a Replicate target or effects', async () => {
    const f = fixture();
    const prepared = await f.prepare();
    expect(prepared.provider).toBe('fal');
    expect(prepared.target).toEqual({ endpoint: f.raw.endpoint });
    expect(prepared.input).toEqual({
      prompt: 'Continue the scene',
      duration: '6',
      resolution: '480p',
      aspect_ratio: '16:9',
    });
    if (prepared.provider !== 'fal')
      throw new Error('Expected native Fal plan');
    expect(prepared.preparedFalDispatch).toEqual({
      endpoint: f.raw.endpoint,
      input: prepared.input,
    });
    expect(prepared.reviewedOutput.version).toBe(f.snapshot.version);
    expect(prepared.generationBriefEvidence.status).toBe('exempted');
    expect(f.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: f.model.key,
          isDeleted: false,
          OR: [{ organizationId: 'org-1' }, { organizationId: null }],
        },
      }),
    );
    for (const effect of Object.values(f.effects))
      expect(effect).not.toHaveBeenCalled();
  });
  it('preserves actual requested reference arrays and canonical extension aspect behavior', async () => {
    const f = fixture();
    const prepared = await f.prepare({
      task: 'extension',
      references: ['https://api.test/images/still-1'],
      videoReferences: ['https://api.test/videos/source-1'],
      parentIngredientId: 'source-1',
    });
    expect(prepared.input).toMatchObject({
      task: 'extension',
      aspect_ratio: 'auto',
      image_urls: ['https://api.test/images/still-1'],
      video_urls: ['https://stored.test/source.mp4'],
    });
    if (prepared.provider !== 'fal') throw new Error('Expected Fal plan');
    expect(prepared.referenceQuoteEvidence).toMatchObject({ inputDuration: 3, referenceEvidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(f.findStoredVideo).toHaveBeenCalledWith({ select: { s3Key: true }, where: { id: 'source-1', organizationId: 'org-1', isDeleted: false, category: IngredientCategory.VIDEO } });
    expect(prepared.output.parentIngredientId).toBe('source-1');
    expect(prepared.output.references).toContain('source-1');
  });
  it('refuses an admitted video whose bytes changed while measuring the quote input', async () => {
    const f = fixture();
    f.files.fingerprintMedia.mockReset().mockResolvedValueOnce({ assetHash: 'a'.repeat(64), sizeBytes: 1000 }).mockResolvedValueOnce({ assetHash: 'b'.repeat(64), sizeBytes: 1000 });
    await expect(f.prepare({ task: 'extension', videoReferences: ['https://api.test/videos/source-1'], parentIngredientId: 'source-1' })).rejects.toThrow();
    for (const effect of Object.values(f.effects)) expect(effect).not.toHaveBeenCalled();
  });
  it('rejects an unreviewed model instead of substituting a provider', async () => {
    const f = fixture();
    f.model.isActive = false;
    await expect(f.prepare()).rejects.toThrow(
      'exact_provider_model_unavailable',
    );
    for (const effect of Object.values(f.effects))
      expect(effect).not.toHaveBeenCalled();
  });
  it('rejects changed schema bytes even when the approval pointer is retained', async () => {
    const f = fixture();
    f.raw.inputSchema.properties.duration.enum = ['30'];
    await expect(f.prepare()).rejects.toThrow('provider_snapshot_unverified');
  });
  it('rejects unsupported requested duration through the actual reviewed schema', async () => {
    await expect(fixture().prepare({ duration: 30 })).rejects.toThrow();
  });
  it('never silently drops the last frame when the reviewed endpoint cannot accept it', async () => {
    await expect(
      fixture().prepare({ lastFrame: 'https://api.test/images/last-1' }),
    ).rejects.toThrow('cannot honor its last frame');
  });
  it('refuses raw node identity locks without a reviewed native reference mapping', async () => {
    await expect(
      fixture().prepare({
        identityReferences: [{ assetId: 'identity-1', role: 'character' }],
      }),
    ).rejects.toThrow('reviewed reference mapping');
  });
  it('refuses lost character/source admission before querying provider contracts', async () => {
    const f = fixture();
    vi.mocked(f.personas.resolveCharacterReferences).mockRejectedValueOnce(
      new Error('Lost source access'),
    );
    await expect(f.prepare({ parentIngredientId: 'source-1' })).rejects.toThrow(
      'Lost source access',
    );
    expect(f.findFirst).not.toHaveBeenCalled();
  });
  it('does not copy arbitrary node provider input or callback fields into the actual request', async () => {
    const prepared = await fixture().prepare({
      webhook_url: 'https://untrusted.test/callback',
      providerInput: { duration: '30' },
      input: { model: 'other' },
    });
    expect(prepared.input).not.toHaveProperty('webhook_url');
    expect(prepared.input).not.toHaveProperty('providerInput');
    expect(prepared.input.duration).toBe('6');
  });
});
