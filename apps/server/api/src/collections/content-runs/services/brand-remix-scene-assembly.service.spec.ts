import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { MediaUrlService } from '@api/services/media-urls/media-url.service';
import type { WhisperService } from '@api/services/whisper/whisper.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import {
  BRAND_REMIX_RUN_CONTRACT,
  brandRemixRunConfigSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandRemixRunPlanningService } from './brand-remix-run-planning.service';
import { BrandRemixSceneAssemblyService } from './brand-remix-scene-assembly.service';
import type { BrandRemixSceneBillingService } from './brand-remix-scene-billing.service';
import type { BrandRemixSceneGenerationService } from './brand-remix-scene-generation.service';
import type { BrandRemixSceneStoreService } from './brand-remix-scene-store.service';

vi.mock('@api/index', () => ({
  scopedWhere: (organizationId: string, value: object) => ({
    ...value,
    organizationId,
    isDeleted: false,
  }),
}));
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-store.service',
  () => ({ BrandRemixSceneStoreService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-generation.service',
  () => ({ BrandRemixSceneGenerationService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-billing.service',
  () => ({ BrandRemixSceneBillingService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-run-planning.service',
  () => ({ BrandRemixRunPlanningService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@api/services/files-microservice/queue/file-queue.service', () => ({
  FileQueueService: class {},
}));
vi.mock('@api/services/whisper/whisper.service', () => ({
  WhisperService: class {},
}));
vi.mock('@api/services/media-urls/media-url.service', () => ({
  MediaUrlService: class {},
}));
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));
vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

const guidedBrief = {
  version: 1 as const,
  mediaKind: 'video' as const,
  fidelityMode: 'guided' as const,
  intent: { objective: 'Original brand introduction' },
  output: { aspectRatio: '9:16' },
  constraints: [],
  provenance: [],
  references: [],
};

function fixture() {
  return brandRemixRunConfigSchema.parse({
    contract: BRAND_REMIX_RUN_CONTRACT,
    version: 1,
    recipeVersion: 1,
    revision: 1,
    phase: 'generating',
    readiness: { state: 'ready', issues: [] },
    draft: {
      fidelityMode: 'guided',
      identity: { avatarAssetId: 'avatar', speechVoiceId: 'voice' },
      intent: { objective: 'Original brand introduction' },
      output: { kind: 'avatar', count: 1, aspectRatio: '9:16' },
      references: [],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'instagram' },
    },
    sourceSnapshot: {
      capturedAt: '2026-09-24T00:00:00.000Z',
      evidence: [],
      metrics: {},
      pattern: {},
      platform: 'instagram',
      selector: { kind: 'source_post', sourcePostId: 'source' },
      sourceId: 'source',
      title: 'Imported',
    },
    concept: {
      savedAt: '2026-09-24T00:00:00.000Z',
      storyboard: [
        {
          id: 'scene',
          ordinal: 1,
          narration: 'Original spoken line',
          durationSeconds: 5,
          visualIntent: 'Original brand product',
        },
      ],
    },
    scenePipeline: {
      version: 1,
      language: 'en',
      state: 'assembling',
      cancellationGeneration: 0,
      replacedAssetIds: [],
      receipts: [],
      operation: {
        id: 'operation',
        quoteId: 'quote',
        revision: 1,
        cancellationGeneration: 0,
        startedAt: '2026-09-24T00:00:00.000Z',
        userId: 'user',
        sequence: 0,
      },
      quote: {
        id: 'quote',
        revision: 1,
        operation: 'generate',
        inputHash: 'hash',
        createdAt: '2026-09-24T00:00:00.000Z',
        expiresAt: '2026-09-24T00:15:00.000Z',
        total: 1,
        items: [
          {
            key: 'run-captions-1',
            stage: 'captions',
            model: 'whisper',
            credits: 1,
            billingMode: 'platform',
            attempt: 1,
          },
        ],
      },
      scenes: {
        scene: {
          identity: { avatarAssetId: 'avatar', speechVoiceId: 'voice' },
          referenceAssetIds: [],
          image: { attempt: 1, state: 'ready', assetId: 'still' },
          video: {
            attempt: 1,
            state: 'ready',
            assetId: 'clip',
            groupId: 'clip-group',
          },
          actualDurationSeconds: 5,
          replacedAssetIds: [],
        },
      },
      assembly: {
        mergedAssetId: 'merged',
        assetId: 'final',
        orderedAssetIds: ['clip'],
        mergeJobId: 'remix-merge-merged',
        captionJobId: 'remix-captions-final',
        mergedStorageKey: 'ingredients/videos/merged.mp4',
        transcription: { attempt: 1, state: 'pending' },
      },
    },
  });
}

describe('caption failure settlement recovery', () => {
  let config = fixture();
  const store = { fence: vi.fn(), read: vi.fn(), save: vi.fn() };
  const generation = { asset: vi.fn() };
  const billing = { reserve: vi.fn(), settle: vi.fn(), release: vi.fn() };
  const planning = {
    resolveBrandContext: vi.fn(),
    buildGenerationBrief: vi.fn(),
  };
  const queue = { processVideo: vi.fn(), getJobStatus: vi.fn() };
  const whisper = { transcribeUrl: vi.fn() };
  const files = { probeMediaFromUrl: vi.fn() };
  const prisma = {
    ingredient: { findFirst: vi.fn(), updateMany: vi.fn() },
    metadata: { updateMany: vi.fn() },
  };
  let service: BrandRemixSceneAssemblyService;

  beforeEach(() => {
    vi.clearAllMocks();
    config = fixture();
    const current = async () => ({ config, brandId: 'brand' });
    store.fence.mockImplementation(current);
    store.read.mockImplementation(current);
    store.save.mockImplementation(async (_org, _run, _old, next) => {
      config = brandRemixRunConfigSchema.parse(next);
    });
    generation.asset.mockResolvedValue({
      id: 'clip',
      status: 'GENERATED',
      s3Key: 'ingredients/avatars/clip.mp4',
    });
    planning.resolveBrandContext.mockResolvedValue({
      brand: { label: 'Brand' },
    });
    planning.buildGenerationBrief.mockReturnValue(guidedBrief);
    queue.processVideo.mockResolvedValue({ jobId: 'caption-job' });
    queue.getJobStatus.mockResolvedValue({ state: 'completed' });
    whisper.transcribeUrl.mockResolvedValue({
      srt: '1\n00:00:00,000 --> 00:00:01,000\nHello\n',
    });
    service = new BrandRemixSceneAssemblyService(
      files as unknown as FilesClientService,
      store as unknown as BrandRemixSceneStoreService,
      generation as unknown as BrandRemixSceneGenerationService,
      billing as unknown as BrandRemixSceneBillingService,
      planning as unknown as BrandRemixRunPlanningService,
      queue as unknown as FileQueueService,
      whisper as unknown as WhisperService,
      {
        buildUrl: () => 'https://cdn.test/merged.mp4',
      } as unknown as MediaUrlService,
      {} as SharedService,
      prisma as unknown as PrismaService,
    );
  });

  it('rejects strict fidelity before caption transcription or rendering', async () => {
    config.draft.fidelityMode = 'strict';
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      /Strict fidelity/,
    );
    expect(whisper.transcribeUrl).not.toHaveBeenCalled();
    expect(queue.processVideo).not.toHaveBeenCalled();
    expect(billing.reserve).not.toHaveBeenCalled();
    expect(planning.buildGenerationBrief).not.toHaveBeenCalled();
  });

  it('does not rerun a caption transcription a live step still holds', async () => {
    const assembly = config.scenePipeline?.assembly;
    if (!assembly) throw new Error('missing assembly');
    assembly.transcription.state = 'claimed';
    assembly.transcription.claimedAt = new Date().toISOString();
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      /still running/,
    );
    expect(whisper.transcribeUrl).not.toHaveBeenCalled();
    expect(billing.reserve).not.toHaveBeenCalled();
    expect(billing.settle).not.toHaveBeenCalled();
  });

  it('reruns an abandoned or uncertain caption transcription under its accepted line', async () => {
    for (const stage of [
      { state: 'claimed' as const, claimedAt: '2026-09-24T00:00:00.000Z' },
      { state: 'uncertain' as const },
    ]) {
      vi.clearAllMocks();
      config = fixture();
      const assembly = config.scenePipeline?.assembly;
      if (!assembly) throw new Error('missing assembly');
      assembly.transcription = { attempt: 1, ...stage };
      await expect(service.step('org', 'run', 'operation')).resolves.toBe(
        false,
      );
      const line = expect.objectContaining({ stage: 'captions', attempt: 1 });
      expect(billing.reserve).toHaveBeenCalledWith(
        'org',
        'run',
        'operation',
        line,
      );
      expect(billing.settle).toHaveBeenCalledWith(
        'org',
        'run',
        'operation',
        line,
      );
      expect(config.scenePipeline?.assembly?.transcription.state).toBe('ready');
    }
  });

  it('marks provider acceptance uncertain without releasing a dispatched hold', async () => {
    whisper.transcribeUrl.mockRejectedValue(new Error('provider timeout'));
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      'provider timeout',
    );
    expect(billing.reserve).toHaveBeenCalledOnce();
    expect(billing.release).not.toHaveBeenCalled();
    expect(billing.settle).not.toHaveBeenCalled();
    expect(queue.processVideo).not.toHaveBeenCalled();
    expect(config.scenePipeline?.assembly?.transcription.state).toBe(
      'uncertain',
    );
  });

  it('compensates an unusable caption transcript and allows a later resume', async () => {
    whisper.transcribeUrl.mockResolvedValueOnce({ srt: '   ' });
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      /no captions/,
    );
    expect(billing.settle).not.toHaveBeenCalled();
    expect(billing.release).toHaveBeenCalledOnce();
    expect(config.scenePipeline?.assembly?.transcription.state).toBe('failed');
    expect(queue.processVideo).not.toHaveBeenCalled();

    whisper.transcribeUrl.mockResolvedValueOnce({
      srt: '1\n00:00:00,000 --> 00:00:01,000\nHello\n',
    });
    await expect(service.step('org', 'run', 'operation')).resolves.toBe(false);
    expect(billing.settle).toHaveBeenCalledOnce();
    expect(config.scenePipeline?.assembly?.srt).toContain('Hello');
    expect(config.scenePipeline?.assembly?.transcription.state).toBe('ready');
    expect(queue.processVideo).not.toHaveBeenCalled();
  });

  it('settles accepted captions when cancellation arrives before rendering', async () => {
    whisper.transcribeUrl.mockImplementation(async () => {
      const pipeline = config.scenePipeline;
      if (!pipeline?.operation) throw new Error('missing operation');
      pipeline.state = 'cancelled';
      pipeline.cancellationGeneration += 1;
      return { srt: '1\n00:00:00,000 --> 00:00:01,000\nHello\n' };
    });
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      /cancelled/,
    );
    expect(billing.settle).toHaveBeenCalledOnce();
    expect(billing.release).not.toHaveBeenCalled();
    expect(queue.processVideo).not.toHaveBeenCalled();
    expect(config.scenePipeline?.state).toBe('cancelled');
    expect(config.scenePipeline?.assembly?.srt).toContain('Hello');
    expect(config.scenePipeline?.assembly?.transcription.state).toBe('ready');
  });

  it('resumes caption rendering without repeating transcription or billing', async () => {
    const assembly = config.scenePipeline?.assembly;
    if (!assembly) throw new Error('missing assembly');
    assembly.srt = '1\n00:00:00,000 --> 00:00:01,000\nHello\n';
    assembly.transcription.state = 'ready';
    queue.getJobStatus.mockResolvedValue({ state: 'failed' });
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      /without repeating transcription/,
    );
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      /without repeating transcription/,
    );
    expect(whisper.transcribeUrl).not.toHaveBeenCalled();
    expect(billing.reserve).not.toHaveBeenCalled();
    expect(billing.settle).not.toHaveBeenCalled();
    expect(queue.processVideo).toHaveBeenCalledTimes(2);
    expect(queue.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'remix-captions-final',
        type: 'add-captions',
      }),
    );
  });

  it('refuses to label guided scene output as strict', async () => {
    const assembly = config.scenePipeline?.assembly;
    if (!assembly) throw new Error('missing assembly');
    assembly.srt = '1\n00:00:00,000 --> 00:00:01,000\nHello\n';
    assembly.transcription.state = 'ready';
    queue.getJobStatus.mockResolvedValue({
      state: 'completed',
      result: {
        success: true,
        s3Key: 'ingredients/videos/final.mp4',
        duration: 5,
        width: 1080,
        height: 1920,
        size: 1000,
      },
    });
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'final',
      metadataId: 'meta',
    });
    prisma.ingredient.updateMany.mockResolvedValue({ count: 1 });
    files.probeMediaFromUrl.mockResolvedValue({
      durationSeconds: 5,
      width: 1080,
      height: 1920,
      audioCodec: 'aac',
      sizeBytes: 1000,
    });
    planning.buildGenerationBrief.mockReturnValue({
      ...guidedBrief,
      fidelityMode: 'strict',
    });
    await expect(service.step('org', 'run', 'operation')).rejects.toThrow(
      /Strict fidelity/,
    );
    expect(store.save).not.toHaveBeenCalled();
    expect(config.execution).toBeUndefined();

    planning.buildGenerationBrief.mockReturnValue(guidedBrief);
    await expect(service.step('org', 'run', 'operation')).resolves.toBe(true);
    expect(config.execution?.generationBrief.fidelityMode).toBe('guided');
    expect(config.phase).toBe('ready_for_review');
    expect(config.scenePipeline?.operation).toBeUndefined();
  });
});
