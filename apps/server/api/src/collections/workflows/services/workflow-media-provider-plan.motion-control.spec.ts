import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import { IngredientCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  createExecutableActionNode,
  type ExecutionContext,
} from '@genfeedai/workflows/engine';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflows/services/workflow-engine-executor-helper.service',
  () => ({ WorkflowEngineExecutorHelperService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@libs/logger/logger.service', () => ({ LoggerService: class {} }));

const MODEL = MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_MOTION_CONTROL;
const HASH = 'a'.repeat(64);
const context: ExecutionContext = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};

interface Asset {
  brandId: string;
  category: IngredientCategory;
  id: string;
  objectKey?: string;
}

const IMAGE: Asset = {
  brandId: 'brand-1',
  category: IngredientCategory.IMAGE,
  id: 'image-1',
};
const VIDEO: Asset = {
  brandId: 'brand-1',
  category: IngredientCategory.VIDEO,
  id: 'video-1',
  objectKey: 'ingredients/videos/video-1',
};

function fixture(
  options: {
    assets?: Record<string, Asset>;
    probe?: { durationSeconds: number | null; sizeBytes: number };
    fingerprints?: Array<{ assetHash: string; sizeBytes: number }>;
  } = {},
) {
  const assets = options.assets ?? { 'image-1': IMAGE, 'video-1': VIDEO };
  const requireMediaAsset = vi.fn(async (value: unknown) => {
    const asset = assets[String(value)];
    if (!asset) throw new Error('Media asset is unavailable');
    return asset;
  });
  const helper = {
    buildMediaIngredientUrl: (id: string) => `https://api.test/images/${id}`,
    buildVideoIngredientUrl: (id: string) => `https://api.test/videos/${id}`,
    extractIngredientId: () => undefined,
    requireBrandId: (brandId: unknown) => {
      if (typeof brandId !== 'string' || !brandId)
        throw new Error('motionControl requires a brandId in node config');
      return brandId;
    },
    requireMediaAsset,
  } as unknown as WorkflowEngineExecutorHelperService;
  const fingerprints = [...(options.fingerprints ?? [])];
  const files = {
    fingerprintMedia: vi.fn(
      async () =>
        fingerprints.shift() ?? { assetHash: HASH, sizeBytes: 5_000_000 },
    ),
    getPresignedDownloadUrlForObjectKey: vi
      .fn()
      .mockResolvedValue('https://storage.test/video-1.mp4?signed=1'),
    probeMediaFromUrl: vi
      .fn()
      .mockResolvedValue(
        options.probe ?? { durationSeconds: 7.2, sizeBytes: 5_000_000 },
      ),
  };
  const personas = personasServiceStub();
  const service = new WorkflowMediaProviderPlanService(
    helper,
    {} as LoggerService,
    personas,
    undefined,
    files as unknown as FilesClientService,
  );
  return { files, personas, requireMediaAsset, service };
}

function prepare(
  service: WorkflowMediaProviderPlanService,
  parameters: Record<string, unknown> = {},
) {
  const node = createExecutableActionNode({
    actionId: 'motionControl',
    id: 'motion-1',
    parameters: { brandId: 'brand-1', model: MODEL, ...parameters },
  });
  return service.prepareNode(
    node,
    new Map<string, unknown>([
      ['image', 'image-1'],
      ['video', 'video-1'],
    ]),
    context,
  );
}

describe('motion control provider preparation', () => {
  it('prices from the measured reference and sends no duration to the provider', async () => {
    const { service } = fixture();

    const plan = await prepare(service, { prompt: 'dance' });

    expect(plan).toMatchObject({
      actionId: 'motionControl',
      model: MODEL,
      provider: 'replicate',
      referenceQuoteEvidence: { duration: 8 },
    });
    expect(plan.input).toEqual({
      character_orientation: 'image',
      image: 'https://api.test/images/image-1',
      keep_original_sound: true,
      mode: 'pro',
      prompt: 'dance',
      video: 'https://api.test/videos/video-1',
    });
    expect(plan.output).toMatchObject({
      brandId: 'brand-1',
      category: IngredientCategory.VIDEO,
      generationPrompt: 'dance',
      organizationId: 'org-1',
      references: ['image-1', 'video-1'],
      userId: 'user-1',
    });
  });

  it('sends the chosen quality, orientation and sound options', async () => {
    const { service } = fixture({
      probe: { durationSeconds: 25, sizeBytes: 5_000_000 },
    });

    const plan = await prepare(service, {
      characterOrientation: 'video',
      keepOriginalSound: false,
      qualityMode: 'std',
    });

    expect(plan.input).toMatchObject({
      character_orientation: 'video',
      keep_original_sound: false,
      mode: 'std',
    });
    expect(plan).toMatchObject({ referenceQuoteEvidence: { duration: 25 } });
  });

  it('binds the quote to the measured bytes, so a different file is a different quote', async () => {
    const first = await prepare(fixture().service);
    const second = await prepare(
      fixture({
        fingerprints: [
          { assetHash: 'b'.repeat(64), sizeBytes: 5_000_000 },
          { assetHash: 'b'.repeat(64), sizeBytes: 5_000_000 },
        ],
      }).service,
    );

    expect(first).toMatchObject({
      referenceQuoteEvidence: { referenceEvidenceHash: expect.any(String) },
    });
    expect(
      (first as { referenceQuoteEvidence: { referenceEvidenceHash: string } })
        .referenceQuoteEvidence.referenceEvidenceHash,
    ).not.toBe(
      (second as { referenceQuoteEvidence: { referenceEvidenceHash: string } })
        .referenceQuoteEvidence.referenceEvidenceHash,
    );
  });

  it.each([
    [{ model: 'other/model' }, 'model'],
    [{ qualityMode: 'ultra' }, 'qualityMode'],
    [{ characterOrientation: 'left' }, 'characterOrientation'],
    [{ keepOriginalSound: 'yes' }, 'keepOriginalSound'],
  ])(
    'refuses %o before any asset is read, naming the field',
    async (parameters, field) => {
      const f = fixture();

      await expect(prepare(f.service, parameters)).rejects.toMatchObject({
        response: {
          source: { pointer: `/data/attributes/${field}` },
        },
      });
      expect(f.requireMediaAsset).not.toHaveBeenCalled();
      expect(f.files.probeMediaFromUrl).not.toHaveBeenCalled();
    },
  );

  it('refuses a reference longer than 10 seconds while the image sets the orientation', async () => {
    const f = fixture({ probe: { durationSeconds: 12, sizeBytes: 5_000_000 } });

    await expect(prepare(f.service)).rejects.toMatchObject({
      response: {
        detail: expect.stringContaining('3 to 10 seconds'),
        source: { pointer: '/data/attributes/video' },
      },
    });
  });

  it('refuses a reference shorter than 3 seconds', async () => {
    const f = fixture({ probe: { durationSeconds: 2, sizeBytes: 5_000_000 } });

    await expect(prepare(f.service)).rejects.toMatchObject({
      response: { source: { pointer: '/data/attributes/video' } },
    });
  });

  it('refuses a reference over 100 MB', async () => {
    const size = 100_000_001;
    const f = fixture({
      fingerprints: [
        { assetHash: HASH, sizeBytes: size },
        { assetHash: HASH, sizeBytes: size },
      ],
      probe: { durationSeconds: 7, sizeBytes: size },
    });

    await expect(prepare(f.service)).rejects.toMatchObject({
      response: { detail: expect.stringContaining('100 MB') },
    });
  });

  it('refuses a reference whose bytes change while it is measured', async () => {
    const f = fixture({
      fingerprints: [
        { assetHash: HASH, sizeBytes: 5_000_000 },
        { assetHash: 'c'.repeat(64), sizeBytes: 5_000_000 },
      ],
    });

    await expect(prepare(f.service)).rejects.toMatchObject({
      response: { detail: expect.stringContaining('changed') },
    });
  });

  it('refuses an unreadable duration', async () => {
    const f = fixture({
      probe: { durationSeconds: null, sizeBytes: 5_000_000 },
    });

    await expect(prepare(f.service)).rejects.toMatchObject({
      response: { detail: expect.stringContaining('no readable duration') },
    });
  });

  it('refuses a source outside the organization Library without measuring anything', async () => {
    const f = fixture({ assets: { 'image-1': IMAGE } });

    await expect(prepare(f.service)).rejects.toMatchObject({
      response: { source: { pointer: '/data/attributes/video' } },
    });
    expect(f.files.fingerprintMedia).not.toHaveBeenCalled();
  });

  it('refuses a source that belongs to another brand', async () => {
    const f = fixture({
      assets: { 'image-1': { ...IMAGE, brandId: 'brand-2' }, 'video-1': VIDEO },
    });

    await expect(prepare(f.service)).rejects.toMatchObject({
      response: {
        detail: expect.stringContaining('another brand'),
        source: { pointer: '/data/attributes/image' },
      },
    });
    expect(f.files.fingerprintMedia).not.toHaveBeenCalled();
  });

  it('refuses a run with no motion video, naming the field', async () => {
    const { service } = fixture();
    const node = createExecutableActionNode({
      actionId: 'motionControl',
      id: 'motion-1',
      parameters: { brandId: 'brand-1', model: MODEL },
    });

    await expect(
      service.prepareNode(
        node,
        new Map<string, unknown>([['image', 'image-1']]),
        context,
      ),
    ).rejects.toMatchObject({
      response: { source: { pointer: '/data/attributes/video' } },
    });
  });

  it('refuses a character the brand no longer grants, before measuring', async () => {
    const f = fixture();
    vi.mocked(f.personas.resolveCharacterReferences).mockRejectedValueOnce(
      new Error('Reference image'),
    );

    await expect(prepare(f.service)).rejects.toThrow('Reference image');
    expect(f.files.fingerprintMedia).not.toHaveBeenCalled();
  });
});
