import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideoProvenanceService } from '@api/collections/videos/services/video-provenance.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { IngredientCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

const makeVideo = (overrides: Record<string, unknown> = {}) => ({
  _id: 'video-1',
  // Prisma returns IngredientCategory as its UPPERCASE stored form ('VIDEO'),
  // not the JS enum lowercase value ('video'). The mock reflects what the DB layer
  // actually returns so the guard comparison in buildPackageFromVideoQuery is valid.
  category: 'VIDEO',
  cdnUrl: 'https://cdn.example.com/video-1.mp4',
  fileSize: 2048,
  generationCompletedAt: new Date('2026-06-20T10:00:00.000Z'),
  generationPrompt: 'a sunset',
  generationSeed: 7,
  generationSource: 'studio',
  id: 'video-1',
  language: 'en',
  loraUsed: 'lora-a',
  metadataId: 'meta-1',
  mimeType: 'video/mp4',
  modelUsed: 'wan-2.2',
  negativePrompt: 'blur',
  s3Key: 'videos/video-1.mp4',
  workflowUsed: 'wf-1',
  ...overrides,
});

describe('VideoProvenanceService', () => {
  let service: VideoProvenanceService;
  let videosService: { findOne: ReturnType<typeof vi.fn> };
  let metadataService: { findOne: ReturnType<typeof vi.fn> };
  let captionsService: { find: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    videosService = { findOne: vi.fn() };
    metadataService = { findOne: vi.fn() };
    captionsService = { find: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoProvenanceService,
        { provide: VideosService, useValue: videosService },
        { provide: MetadataService, useValue: metadataService },
        { provide: CaptionsService, useValue: captionsService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VideoProvenanceService>(VideoProvenanceService);
  });

  it('builds the canonical media package from ingredient, metadata, and captions', async () => {
    videosService.findOne.mockResolvedValue(makeVideo());
    metadataService.findOne.mockResolvedValue({
      duration: 12,
      fps: 24,
      hasAudio: true,
      height: 1920,
      resolution: '1080x1920',
      width: 1080,
    });
    captionsService.find.mockResolvedValue([{ content: 'Hello there' }]);

    const pkg = await service.buildProvenance('video-1', {
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(pkg.assetId).toBe('video-1');
    expect(pkg.manifest.canonicalUrl).toBe(
      'https://cdn.example.com/video-1.mp4',
    );
    expect(pkg.manifest.storageKey).toBe('videos/video-1.mp4');
    expect(pkg.manifest.media).toEqual({
      durationSeconds: 12,
      fps: 24,
      hasAudio: true,
      height: 1920,
      resolution: '1080x1920',
      width: 1080,
    });
    expect(pkg.manifest.generation).toMatchObject({
      completedAt: '2026-06-20T10:00:00.000Z',
      lora: 'lora-a',
      model: 'wan-2.2',
      seed: 7,
    });
    // Caption text becomes a single timestamped cue using the media duration.
    expect(pkg.transcriptSidecar.segments).toEqual([
      { end: 12, start: 0, text: 'Hello there' },
    ]);
    expect(pkg.transcriptSidecar.hasTimestamps).toBe(true);
    expect(typeof pkg.manifest.generatedAt).toBe('string');
  });

  it('scopes the lookup to the requesting user and organization', async () => {
    videosService.findOne.mockResolvedValue(makeVideo());
    metadataService.findOne.mockResolvedValue(null);
    captionsService.find.mockResolvedValue([]);

    await service.buildProvenance('video-1', {
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(videosService.findOne).toHaveBeenCalledWith({
      OR: [{ user: 'user-1' }, { organization: 'org-1' }],
      _id: 'video-1',
      isDeleted: false,
    });
    // Soft-deleted metadata must never leak into the provenance package.
    expect(metadataService.findOne).toHaveBeenCalledWith({
      _id: 'meta-1',
      isDeleted: false,
    });
  });

  it('builds public provenance only from generated public videos', async () => {
    videosService.findOne.mockResolvedValue(makeVideo());
    metadataService.findOne.mockResolvedValue(null);
    captionsService.find.mockResolvedValue([{ content: 'Public transcript' }]);

    const pkg = await service.buildPublicProvenance('video-1');

    expect(pkg.assetId).toBe('video-1');
    expect(videosService.findOne).toHaveBeenCalledWith({
      _id: 'video-1',
      // All three enum fields are converted to the Prisma UPPERCASE form by
      // CategoryPrismaUtil before being passed to findFirst. The JS enum values
      // are lowercase ('video', 'public', 'generated'); Prisma stores UPPERCASE.
      category: 'VIDEO',
      isDeleted: false,
      scope: 'PUBLIC',
      status: 'GENERATED',
    });
    expect(pkg.transcriptSidecar.segmentCount).toBe(1);
  });

  it('does not build public provenance for non-public videos', async () => {
    videosService.findOne.mockResolvedValue(null);

    await expect(
      service.buildPublicProvenance('video-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFound when the video does not exist', async () => {
    videosService.findOne.mockResolvedValue(null);

    await expect(
      service.buildProvenance('missing', { userId: 'user-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFound when the ingredient is not a video', async () => {
    videosService.findOne.mockResolvedValue(
      makeVideo({ category: IngredientCategory.IMAGE }),
    );

    await expect(
      service.buildProvenance('video-1', { userId: 'user-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an unscoped lookup without issuing a query', async () => {
    await expect(
      service.buildProvenance('video-1', { organizationId: '', userId: '' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.buildProvenance('video-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(videosService.findOne).not.toHaveBeenCalled();
  });

  it('emits an empty transcript and null media when none are available', async () => {
    videosService.findOne.mockResolvedValue(makeVideo({ metadataId: null }));
    captionsService.find.mockResolvedValue([]);

    const pkg = await service.buildProvenance('video-1', { userId: 'user-1' });

    expect(metadataService.findOne).not.toHaveBeenCalled();
    expect(pkg.manifest.media.durationSeconds).toBeNull();
    expect(pkg.transcriptSidecar.segmentCount).toBe(0);
    expect(pkg.transcriptSidecar.vtt).toBe('WEBVTT\n');
  });

  it('builds watermark attribution evaluation from the scoped provenance package', async () => {
    videosService.findOne.mockResolvedValue(makeVideo());
    metadataService.findOne.mockResolvedValue({
      duration: 12,
      fps: 24,
      hasAudio: true,
      height: 1920,
      resolution: '1080x1920',
      width: 1080,
    });
    captionsService.find.mockResolvedValue([{ content: 'Hello there' }]);

    const evaluation = await service.buildWatermarkAttributionEvaluation(
      'video-1',
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(videosService.findOne).toHaveBeenCalledWith({
      OR: [{ user: 'user-1' }, { organization: 'org-1' }],
      _id: 'video-1',
      isDeleted: false,
    });
    expect(evaluation.primaryApproach).toBe('provenance_manifest');
    expect(evaluation.missingSignals).toEqual(['contentHash']);
    expect(evaluation.approaches[0]).toMatchObject({
      approach: 'provenance_manifest',
      readiness: 'ready',
      tamperDetection: 'low',
    });
  });
});
