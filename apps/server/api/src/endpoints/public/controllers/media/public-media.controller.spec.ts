vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => {
    const { HttpException, HttpStatus } = require('@nestjs/common');
    throw new HttpException(
      { detail: `${type} ${id} doesn't exist`, title: `${type} not found` },
      HttpStatus.NOT_FOUND,
    );
  }),
}));
vi.mock('@api/endpoints/public/services/public-media.service', () => ({
  PublicMediaService: class {},
}));
vi.mock('@api/endpoints/public/services/public-views.service', () => ({
  PublicViewsService: class {},
}));

import { PublicMediaController } from '@api/endpoints/public/controllers/media/public-media.controller';
import { PublicMediaService } from '@api/endpoints/public/services/public-media.service';
import { PublicViewsService } from '@api/endpoints/public/services/public-views.service';
import type {
  IMediaProvenanceManifest,
  IPublicMediaRouteReference,
} from '@genfeedai/contracts/interfaces';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const assetId = 'cvideo123456789';

const routeReference = {
  assetId,
  canonicalUrl: 'https://cdn.example.com/videos/cvideo123456789.mp4',
  kind: 'video',
  manifestFilename: 'cvideo123456789.manifest.json',
  manifestPath: `/public/media/${assetId}/manifest.json`,
  mediaPath: `/public/videos/${assetId}/video.mp4`,
  provenancePath: `/public/media/${assetId}`,
  publicPagePath: `/public/videos/${assetId}`,
  transcriptFilename: 'cvideo123456789.transcript.vtt',
  transcriptPath: `/public/media/${assetId}/transcript.vtt`,
} satisfies IPublicMediaRouteReference;

const manifest = {
  assetId,
  canonicalUrl: 'https://cdn.example.com/videos/cvideo123456789.mp4',
  kind: 'video',
} as IMediaProvenanceManifest;

describe('PublicMediaController', () => {
  let controller: PublicMediaController;
  let publicMediaService: {
    getManifest: ReturnType<typeof vi.fn>;
    getRouteReference: ReturnType<typeof vi.fn>;
    getTranscriptVtt: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    publicMediaService = {
      getManifest: vi.fn().mockResolvedValue(manifest),
      getRouteReference: vi.fn().mockResolvedValue(routeReference),
      getTranscriptVtt: vi.fn().mockResolvedValue('WEBVTT\n'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicMediaController],
      providers: [
        {
          provide: PublicMediaService,
          useValue: publicMediaService,
        },
        {
          provide: PublicViewsService,
          useValue: {
            recordMediaViews: async (ids: string[]) =>
              Object.fromEntries(ids.map((id) => [id, 3])),
            recordRecreation: async () => 5,
          },
        },
      ],
    }).compile();

    controller = module.get<PublicMediaController>(PublicMediaController);
  });

  afterEach(() => vi.clearAllMocks());

  it('returns media route references in a data envelope', async () => {
    await expect(controller.resolveMedia(assetId)).resolves.toEqual({
      data: routeReference,
    });
    expect(publicMediaService.getRouteReference).toHaveBeenCalledWith(assetId);
  });

  it('returns the raw manifest artifact', async () => {
    await expect(controller.getManifest(assetId)).resolves.toBe(manifest);
    expect(publicMediaService.getManifest).toHaveBeenCalledWith(assetId);
  });

  it('returns the raw WebVTT transcript artifact', async () => {
    await expect(controller.getTranscript(assetId)).resolves.toBe('WEBVTT\n');
    expect(publicMediaService.getTranscriptVtt).toHaveBeenCalledWith(assetId);
  });

  it('counts only well-formed ids a gallery visitor saw', async () => {
    const request = {
      headers: { 'user-agent': 'Mozilla/5.0' },
      ip: '203.0.113.7',
    } as Request;

    await expect(
      controller.recordViews(request, { ids: [assetId, 'not-an-id'] }),
    ).resolves.toEqual({ data: { views: { [assetId]: 3 } } });
  });

  it.each([
    [assetId, { data: { recreations: 5 } }],
    ['not-an-id', { data: null }],
  ])('answers a Recreate click on %s with %j', async (id, expected) => {
    const request = { headers: {}, ip: '203.0.113.7' } as Request;

    await expect(controller.recordRecreation(request, id)).resolves.toEqual(
      expected,
    );
  });

  it('rejects invalid media ids before resolving route references', async () => {
    await expect(controller.resolveMedia('not-an-id')).rejects.toThrow(
      HttpException,
    );
    expect(publicMediaService.getRouteReference).not.toHaveBeenCalled();
  });

  it('rejects invalid media ids before returning artifacts', async () => {
    await expect(controller.getManifest('not-an-id')).rejects.toThrow(
      HttpException,
    );
    await expect(controller.getTranscript('not-an-id')).rejects.toThrow(
      HttpException,
    );
    expect(publicMediaService.getManifest).not.toHaveBeenCalled();
    expect(publicMediaService.getTranscriptVtt).not.toHaveBeenCalled();
  });
});
