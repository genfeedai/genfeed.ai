import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import type { MediaPerceptionDescriberService } from '@api/services/media-perception/media-perception-describer.service';
import type { MediaUrlService } from '@api/services/media-urls/media-url.service';
import type { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import type { WhisperService } from '@api/services/whisper/whisper.service';
import { IngredientCategory } from '@genfeedai/contracts';
import {
  MEDIA_PERCEPTION_SCHEMA_VERSION,
  type MediaPerceptionArtefacts,
  type MediaSceneDescription,
} from '@genfeedai/contracts/api-types/contracts';
import { MEDIA_PERCEPTION_MAX_ATTEMPTS } from '@genfeedai/contracts/queue';
import { Prisma } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';

const HASH = 'a'.repeat(64);
const CREATED_AT = new Date('2026-09-26T10:00:00.000Z');

const DESCRIPTION: MediaSceneDescription = {
  brandElements: ['Genfeed logo'],
  contentWarnings: [],
  hasPeople: true,
  hasSuspectedMinors: false,
  setting: 'studio',
  subjects: ['presenter'],
  summary: 'A presenter talks to camera in a studio.',
  textOnScreen: 'LAUNCH DAY',
};

const ARTEFACTS: MediaPerceptionArtefacts = {
  assetHash: HASH,
  audioUrl: 'https://cdn.example.com/perception/audio.mp3',
  diagnostics: [],
  durationSeconds: 12,
  frames: [
    {
      height: 1024,
      index: 0,
      storageKey: 'ingredients/images/perception/org-1/frame-0.jpg',
      timestampSeconds: 1,
      url: 'https://cdn.example.com/perception/frame-0.jpg',
      width: 576,
    },
  ],
  framesStatus: 'ready',
  kind: 'video',
  ocr: [{ frameIndex: 0, text: 'LAUNCH DAY' }],
  ocrStatus: 'ready',
};

function perceptionRow(overrides: Record<string, unknown> = {}) {
  return {
    assetHash: HASH,
    attempts: 0,
    audioUrl: ARTEFACTS.audioUrl,
    createdAt: CREATED_AT,
    description: null,
    descriptionModel: null,
    descriptionStatus: 'pending',
    diagnostics: [],
    durationSeconds: 12,
    frames: ARTEFACTS.frames,
    framesStatus: 'ready',
    id: 'perception-1',
    ingredientId: 'asset-1',
    kind: 'video',
    ocr: ARTEFACTS.ocr,
    ocrStatus: 'ready',
    organizationId: 'org-1',
    reusedFromId: null,
    schemaVersion: MEDIA_PERCEPTION_SCHEMA_VERSION,
    transcript: null,
    transcriptStatus: 'pending',
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function makeHarness(
  options: {
    existing?: Record<string, unknown> | null;
    reusable?: Record<string, unknown> | null;
  } = {},
) {
  const ingredientFindFirst = vi.fn().mockResolvedValue({
    brandId: 'brand-1',
    category: IngredientCategory.VIDEO,
    cdnUrl: 'https://cdn.example.com/asset.mp4',
    id: 'asset-1',
  });
  const perceptionFindFirst = vi
    .fn()
    .mockResolvedValueOnce(options.existing ?? null)
    .mockResolvedValueOnce(options.reusable ?? null);
  const upsert = vi.fn().mockResolvedValue(perceptionRow());
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findMany = vi.fn().mockResolvedValue([]);
  const ingredientFindMany = vi.fn().mockResolvedValue([]);

  const fingerprintMedia = vi
    .fn()
    .mockResolvedValue({ assetHash: HASH, sizeBytes: 1024 });
  const extractPerceptionArtefacts = vi.fn().mockResolvedValue(ARTEFACTS);
  const transcribeUrl = vi.fn().mockResolvedValue({
    duration: 11.5,
    language: 'en',
    segments: [],
    srt: '',
    text: ' Welcome to launch day. ',
  });
  const describe = vi.fn().mockResolvedValue(DESCRIPTION);
  const record = vi.fn().mockResolvedValue(undefined);
  const mediaUrlService = {
    buildUrl: vi.fn((key: string) => `https://signed.example.com/${key}`),
    buildUrlFromAbsolute: vi.fn((url: string) => `${url}?signed=1`),
  };
  const config: Record<string, unknown> = {
    MEDIA_PERCEPTION_FRAME_COUNT: 4,
    MEDIA_PERCEPTION_VISION_MODEL: 'openrouter/vision-test',
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

  const service = new MediaPerceptionService(
    {
      ingredient: {
        findFirst: ingredientFindFirst,
        findMany: ingredientFindMany,
      },
      mediaPerception: {
        findFirst: perceptionFindFirst,
        findMany,
        updateMany,
        upsert,
      },
    } as unknown as PrismaService,
    {
      extractPerceptionArtefacts,
      fingerprintMedia,
    } as unknown as FilesClientService,
    { transcribeUrl } as unknown as WhisperService,
    { describe } as unknown as MediaPerceptionDescriberService,
    { record } as unknown as MediaVendorCostLedgerService,
    mediaUrlService as unknown as MediaUrlService,
    { get: (key: string) => config[key] } as unknown as ConfigService,
    logger as unknown as LoggerService,
  );

  return {
    mediaUrlService,
    describe,
    extractPerceptionArtefacts,
    findMany,
    fingerprintMedia,
    ingredientFindFirst,
    ingredientFindMany,
    perceptionFindFirst,
    record,
    service,
    transcribeUrl,
    updateMany,
    upsert,
  };
}

const JOB = {
  ingredientId: 'asset-1',
  organizationId: 'org-1',
  reason: 'perceive',
} as const;

describe('MediaPerceptionService.process', () => {
  it('perceives a new asset: fingerprint, artefacts, transcript and description', async () => {
    const h = makeHarness();

    await expect(h.service.process(JOB)).resolves.toBe('perceived');

    expect(h.ingredientFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
    expect(h.extractPerceptionArtefacts).toHaveBeenCalledWith({
      assetHash: HASH,
      frameCount: 4,
      kind: 'video',
      organizationId: 'org-1',
      url: 'https://cdn.example.com/asset.mp4',
    });
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          assetHash: HASH,
          descriptionStatus: 'pending',
          framesStatus: 'ready',
          ingredientId: 'asset-1',
          ocrStatus: 'ready',
          organizationId: 'org-1',
          transcriptStatus: 'pending',
        }),
      }),
    );
    expect(h.transcribeUrl).toHaveBeenCalledWith(
      `${ARTEFACTS.audioUrl}?signed=1`,
      'auto',
    );
    expect(h.describe).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        frames: [
          expect.objectContaining({
            url: 'https://signed.example.com/ingredients/images/perception/org-1/frame-0.jpg',
          }),
        ],
        model: 'openrouter/vision-test',
        organizationId: 'org-1',
        transcript: 'Welcome to launch day.',
      }),
    );
    expect(h.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attempts: 0,
        description: DESCRIPTION,
        descriptionModel: 'openrouter/vision-test',
        descriptionStatus: 'ready',
        nextAttemptAt: null,
        transcript: {
          durationSeconds: 11.5,
          language: 'en',
          text: 'Welcome to launch day.',
        },
        transcriptStatus: 'ready',
      }),
      where: { id: 'perception-1', isDeleted: false, organizationId: 'org-1' },
    });
  });

  it('records transcription spend in the media vendor-cost ledger', async () => {
    const h = makeHarness();

    await h.service.process(JOB);

    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        category: 'media-perception-transcription',
        model: 'openai/whisper',
        organizationId: 'org-1',
        provider: 'replicate',
        units: 11.5,
      }),
    );
  });

  it('keeps frames, OCR and transcript when the vision model is unavailable', async () => {
    const h = makeHarness();
    h.describe.mockRejectedValueOnce(new Error('vision provider down'));

    await expect(h.service.process(JOB)).resolves.toBe('perceived');

    const { data } = h.updateMany.mock.calls[0][0];
    expect(data.transcriptStatus).toBe('ready');
    expect(data.descriptionStatus).toBe('pending');
    expect(data.attempts).toBe(1);
    expect(data.nextAttemptAt).toBeInstanceOf(Date);
    expect(data.diagnostics).toEqual([
      expect.objectContaining({
        artefact: 'description',
        code: 'vision_model_unavailable',
      }),
    ]);
  });

  it('never re-runs perception for bytes another asset already has', async () => {
    const h = makeHarness({
      reusable: perceptionRow({
        description: DESCRIPTION,
        descriptionStatus: 'ready',
        id: 'perception-source',
        ingredientId: 'asset-0',
        transcript: { durationSeconds: 12, language: 'en', text: 'hi' },
        transcriptStatus: 'ready',
      }),
    });

    await expect(h.service.process(JOB)).resolves.toBe('reused');

    expect(h.extractPerceptionArtefacts).not.toHaveBeenCalled();
    expect(h.transcribeUrl).not.toHaveBeenCalled();
    expect(h.describe).not.toHaveBeenCalled();
    expect(h.perceptionFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          assetHash: HASH,
          ingredientId: { not: 'asset-1' },
          isDeleted: false,
          organizationId: 'org-1',
          schemaVersion: MEDIA_PERCEPTION_SCHEMA_VERSION,
        },
      }),
    );
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          ingredientId: 'asset-1',
          organizationId: 'org-1',
          reusedFromId: 'perception-source',
        }),
      }),
    );
  });

  it('skips an asset whose record is complete', async () => {
    const h = makeHarness({
      existing: perceptionRow({
        description: DESCRIPTION,
        descriptionStatus: 'ready',
        transcript: { durationSeconds: 12, language: 'en', text: 'hi' },
        transcriptStatus: 'ready',
      }),
    });

    await expect(h.service.process(JOB)).resolves.toBe('skipped');
    expect(h.fingerprintMedia).not.toHaveBeenCalled();
  });

  it('retries only the pending artefacts of an existing record', async () => {
    const h = makeHarness({
      existing: perceptionRow({
        attempts: 1,
        transcript: { durationSeconds: 12, language: 'en', text: 'hi' },
        transcriptStatus: 'ready',
      }),
    });

    await expect(h.service.process({ ...JOB, reason: 'retry' })).resolves.toBe(
      'retried',
    );

    expect(h.fingerprintMedia).not.toHaveBeenCalled();
    expect(h.transcribeUrl).not.toHaveBeenCalled();
    expect(h.describe).toHaveBeenCalledOnce();
    expect(h.updateMany.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        attempts: 1,
        descriptionStatus: 'ready',
        nextAttemptAt: null,
      }),
    );
  });

  it('marks pending artefacts failed once the attempt budget is spent', async () => {
    const h = makeHarness({
      existing: perceptionRow({
        attempts: MEDIA_PERCEPTION_MAX_ATTEMPTS - 1,
        transcript: { durationSeconds: 12, language: 'en', text: 'hi' },
        transcriptStatus: 'ready',
      }),
    });
    h.describe.mockRejectedValueOnce(new Error('vision provider down'));

    await h.service.process({ ...JOB, reason: 'retry' });

    const { data } = h.updateMany.mock.calls[0][0];
    expect(data.descriptionStatus).toBe('failed');
    expect(data.nextAttemptAt).toBeNull();
    expect(data.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artefact: 'description',
          code: 'retries_exhausted',
        }),
      ]),
    );
  });

  it('skips an ingredient outside the organization or without media', async () => {
    const h = makeHarness();
    h.ingredientFindFirst.mockResolvedValueOnce(null);

    await expect(h.service.process(JOB)).resolves.toBe('skipped');
    expect(h.fingerprintMedia).not.toHaveBeenCalled();
  });

  it('does not start fresh perception from a retry job', async () => {
    const h = makeHarness();

    await expect(h.service.process({ ...JOB, reason: 'retry' })).resolves.toBe(
      'skipped',
    );
    expect(h.fingerprintMedia).not.toHaveBeenCalled();
  });

  it('marks the description unavailable for audio and the transcript unavailable without audio', async () => {
    const h = makeHarness();
    h.ingredientFindFirst.mockResolvedValueOnce({
      brandId: null,
      category: IngredientCategory.IMAGE,
      cdnUrl: 'https://cdn.example.com/still.png',
      id: 'asset-1',
    });
    h.extractPerceptionArtefacts.mockResolvedValueOnce({
      ...ARTEFACTS,
      audioUrl: null,
      durationSeconds: null,
      kind: 'image',
    });

    await h.service.process(JOB);

    expect(h.upsert.mock.calls[0][0].create).toEqual(
      expect.objectContaining({
        descriptionStatus: 'pending',
        transcriptStatus: 'unavailable',
      }),
    );
  });
});

describe('MediaPerceptionService review hardening', () => {
  it('writes Prisma.DbNull, not null, to the nullable Json columns', async () => {
    const h = makeHarness();

    await h.service.process(JOB);

    const { create } = h.upsert.mock.calls[0][0];
    expect(create.description).toBe(Prisma.DbNull);
    expect(create.transcript).toBe(Prisma.DbNull);
    expect(create.isDeleted).toBe(false);
  });

  it('defers instead of copying identical bytes that are still pending', async () => {
    const h = makeHarness({
      reusable: perceptionRow({
        id: 'perception-source',
        ingredientId: 'asset-0',
      }),
    });

    await expect(h.service.process(JOB)).resolves.toBe('skipped');
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.extractPerceptionArtefacts).not.toHaveBeenCalled();
  });

  it('clears the retry schedule when a retry cannot run', async () => {
    const h = makeHarness();
    h.ingredientFindFirst.mockResolvedValueOnce(null);

    await expect(h.service.process({ ...JOB, reason: 'retry' })).resolves.toBe(
      'skipped',
    );
    expect(h.updateMany).toHaveBeenCalledWith({
      data: { nextAttemptAt: null },
      where: {
        ingredientId: 'asset-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('resolves keyless external media through its metadata link', async () => {
    const h = makeHarness();
    h.ingredientFindFirst.mockResolvedValueOnce({
      brandId: null,
      category: IngredientCategory.VIDEO,
      cdnUrl: null,
      id: 'asset-1',
      metadata: { result: 'https://provider.example.com/clip.mp4' },
    });

    await h.service.process(JOB);

    expect(h.fingerprintMedia).toHaveBeenCalledWith(
      'https://provider.example.com/clip.mp4',
    );
  });
});

describe('MediaPerceptionService.getForAssets', () => {
  it('reports a missing or pending record as perception-pending without waiting', async () => {
    const h = makeHarness();
    h.findMany.mockResolvedValueOnce([
      perceptionRow({ ingredientId: 'asset-1' }),
      perceptionRow({
        description: DESCRIPTION,
        descriptionStatus: 'ready',
        id: 'perception-2',
        ingredientId: 'asset-2',
        transcript: { durationSeconds: 12, language: 'en', text: 'hi' },
        transcriptStatus: 'ready',
      }),
    ]);

    const lookups = await h.service.getForAssets('org-1', [
      'asset-1',
      'asset-2',
      'asset-3',
    ]);

    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ingredientId: { in: ['asset-1', 'asset-2', 'asset-3'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(
      lookups.map(({ assetId, isPerceptionPending, perception }) => [
        assetId,
        isPerceptionPending,
        perception?.id ?? null,
      ]),
    ).toEqual([
      ['asset-1', true, 'perception-1'],
      ['asset-2', false, 'perception-2'],
      ['asset-3', true, null],
    ]);
  });

  it('treats a row that no longer matches the contract as absent', async () => {
    const h = makeHarness();
    h.findMany.mockResolvedValueOnce([perceptionRow({ frames: 'corrupt' })]);

    const [lookup] = await h.service.getForAssets('org-1', ['asset-1']);

    expect(lookup).toEqual({
      assetId: 'asset-1',
      isPerceptionPending: true,
      perception: null,
    });
  });
});

describe('MediaPerceptionService sweep discovery', () => {
  it('finds recently completed media assets without a live record', async () => {
    const h = makeHarness();
    h.ingredientFindMany.mockResolvedValueOnce([
      { id: 'asset-1', organizationId: 'org-1' },
      { id: 'asset-2', organizationId: null },
    ]);
    const since = new Date('2026-09-25T00:00:00.000Z');

    await expect(h.service.findUnperceivedAssets(since, 10)).resolves.toEqual([
      { ingredientId: 'asset-1', organizationId: 'org-1' },
    ]);
    expect(h.ingredientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        take: 10,
        where: expect.objectContaining({
          createdAt: { gte: since },
          isDeleted: false,
          mediaPerceptions: {
            none: {
              isDeleted: false,
              schemaVersion: MEDIA_PERCEPTION_SCHEMA_VERSION,
            },
          },
        }),
      }),
    );
  });
});
