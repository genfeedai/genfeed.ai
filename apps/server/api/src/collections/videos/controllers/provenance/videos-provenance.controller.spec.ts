import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VideosProvenanceController } from '@api/collections/videos/controllers/provenance/videos-provenance.controller';
import { VideoProvenanceService } from '@api/collections/videos/services/video-provenance.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type {
  IMediaProvenancePackage,
  IMediaWatermarkAttributionEvaluation,
} from '@genfeedai/interfaces';
import { Test, type TestingModule } from '@nestjs/testing';

const mockUser = {
  id: 'user_authProvider',
  publicMetadata: { organization: 'org-1', user: 'user-1' },
} as unknown as User;

const mockPackage = {
  assetId: 'video-1',
  manifest: { assetId: 'video-1' },
  manifestFilename: 'video-1.manifest.json',
  transcriptSidecar: { filename: 'video-1.transcript.vtt' },
} as unknown as IMediaProvenancePackage;

const mockWatermarkEvaluation = {
  approaches: [],
  assetId: 'video-1',
  fallbackBehavior: 'Use manifest fallback',
  generatedAt: '2026-06-21T00:00:00.000Z',
  missingSignals: ['contentHash'],
  primaryApproach: 'provenance_manifest',
  recommendedAction: 'Use manifest attribution',
  schemaVersion: 1,
} as unknown as IMediaWatermarkAttributionEvaluation;

describe('VideosProvenanceController', () => {
  let controller: VideosProvenanceController;
  let videoProvenanceService: {
    buildProvenance: ReturnType<typeof vi.fn>;
    buildWatermarkAttributionEvaluation: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    videoProvenanceService = {
      buildProvenance: vi.fn().mockResolvedValue(mockPackage),
      buildWatermarkAttributionEvaluation: vi
        .fn()
        .mockResolvedValue(mockWatermarkEvaluation),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosProvenanceController],
      providers: [
        {
          provide: VideoProvenanceService,
          useValue: videoProvenanceService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<VideosProvenanceController>(
      VideosProvenanceController,
    );
  });

  it('returns the provenance package wrapped in a data envelope', async () => {
    const result = await controller.getProvenance(mockUser, 'video-1');

    expect(result).toEqual({ data: mockPackage });
  });

  it('passes the caller scope to the service', async () => {
    await controller.getProvenance(mockUser, 'video-1');

    expect(videoProvenanceService.buildProvenance).toHaveBeenCalledWith(
      'video-1',
      { organizationId: 'org-1', userId: 'user-1' },
    );
  });

  it('returns the watermark attribution evaluation wrapped in a data envelope', async () => {
    const result = await controller.getWatermarkEvaluation(mockUser, 'video-1');

    expect(result).toEqual({ data: mockWatermarkEvaluation });
  });

  it('passes the caller scope to the watermark evaluation service', async () => {
    await controller.getWatermarkEvaluation(mockUser, 'video-1');

    expect(
      videoProvenanceService.buildWatermarkAttributionEvaluation,
    ).toHaveBeenCalledWith('video-1', {
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });
});
