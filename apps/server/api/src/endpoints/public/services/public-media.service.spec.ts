import { VideoProvenanceService } from '@api/collections/videos/services/video-provenance.service';
import { PublicMediaService } from '@api/endpoints/public/services/public-media.service';
import type { IMediaProvenancePackage } from '@genfeedai/interfaces';
import { Test, type TestingModule } from '@nestjs/testing';

const mediaPackage = {
  assetId: 'cvideo123456789',
  manifest: {
    assetId: 'cvideo123456789',
    canonicalUrl: 'https://cdn.example.com/videos/cvideo123456789.mp4',
    kind: 'video',
  },
  manifestFilename: 'cvideo123456789.manifest.json',
  transcriptSidecar: {
    filename: 'cvideo123456789.transcript.vtt',
    vtt: 'WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n',
  },
} as unknown as IMediaProvenancePackage;

describe('PublicMediaService', () => {
  let service: PublicMediaService;
  let videoProvenanceService: {
    buildPublicProvenance: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    videoProvenanceService = {
      buildPublicProvenance: vi.fn().mockResolvedValue(mediaPackage),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicMediaService,
        {
          provide: VideoProvenanceService,
          useValue: videoProvenanceService,
        },
      ],
    }).compile();

    service = module.get<PublicMediaService>(PublicMediaService);
  });

  it('builds canonical public route references for a media asset', async () => {
    const result = await service.getRouteReference('cvideo123456789');

    expect(result).toEqual({
      assetId: 'cvideo123456789',
      canonicalUrl: 'https://cdn.example.com/videos/cvideo123456789.mp4',
      kind: 'video',
      manifestFilename: 'cvideo123456789.manifest.json',
      manifestPath: '/public/media/cvideo123456789/manifest.json',
      mediaPath: '/public/videos/cvideo123456789/video.mp4',
      provenancePath: '/public/media/cvideo123456789',
      publicPagePath: '/public/videos/cvideo123456789',
      transcriptFilename: 'cvideo123456789.transcript.vtt',
      transcriptPath: '/public/media/cvideo123456789/transcript.vtt',
    });
  });

  it('returns the raw manifest for the manifest route', async () => {
    await expect(service.getManifest('cvideo123456789')).resolves.toBe(
      mediaPackage.manifest,
    );
  });

  it('returns the raw WebVTT transcript for the transcript route', async () => {
    await expect(service.getTranscriptVtt('cvideo123456789')).resolves.toBe(
      mediaPackage.transcriptSidecar.vtt,
    );
  });
});
