import { readFileSync } from 'node:fs';
import { VideosCaptionsController } from '@api/collections/videos/controllers/captions/videos-captions.controller';
import { VideosProvenanceController } from '@api/collections/videos/controllers/provenance/videos-provenance.controller';
import { VideosMergeController } from '@api/collections/videos/controllers/relationships/videos-merge.controller';
import { VideosRelationshipsController } from '@api/collections/videos/controllers/relationships/videos-relationships.controller';
import { VideosUploadController } from '@api/collections/videos/controllers/upload/videos-upload.controller';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideoMergeOrchestrationService } from '@api/collections/videos/services/video-merge-orchestration.service';
import { VideosModule } from '@api/collections/videos/videos.module';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Videos split controllers', () => {
  it('preserves the merge route and legacy OpenAPI identity', () => {
    const handler = VideosMergeController.prototype.mergeVideos;

    expect(Reflect.getMetadata(PATH_METADATA, VideosMergeController)).toBe(
      'videos',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('merge');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toMatchObject({
      operationId: 'VideosRelationshipsController.mergeVideos',
      summary: 'mergeVideos',
    });
    const parameterTypes = Reflect.getMetadata(
      'design:paramtypes',
      VideosMergeController.prototype,
      'mergeVideos',
    ) as unknown[];
    expect(parameterTypes[2]).toBe(CreateMergedVideoDto);
  });

  it('preserves RolesGuard while keeping the local ffmpeg merge uncredited', () => {
    const handler = VideosMergeController.prototype.mergeVideos;

    expect(
      Reflect.getMetadata(GUARDS_METADATA, VideosMergeController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, VideosMergeController),
    ).not.toContain(CreditsGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []).not.toContain(
      CreditsGuard,
    );
    expect(Reflect.getMetadata(CREDITS_KEY, handler)).toBeUndefined();
    expect(
      Reflect.getMetadata(CREDITS_KEY, VideosMergeController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, VideosMergeController),
    ).toBeUndefined();
  });

  it('preserves controller registration order around the extracted merge route', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, VideosModule),
    ).toEqual([
      VideosCaptionsController,
      VideosProvenanceController,
      VideosController,
      VideosRelationshipsController,
      VideosMergeController,
      VideosUploadController,
    ]);
  });

  it('registers merge orchestration in the owning module', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, VideosModule),
    ).toContain(VideoMergeOrchestrationService);
  });

  it('removes mergeVideos from the relationships controller', () => {
    expect(
      Object.hasOwn(VideosRelationshipsController.prototype, 'mergeVideos'),
    ).toBe(false);
  });

  it('preserves LogMethod on the moved transport', () => {
    const source = readFileSync(
      new URL('./relationships/videos-merge.controller.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      '@LogMethod({ logEnd: false, logError: true, logStart: true })',
    );
  });

  it.each([
    './relationships/videos-relationships.controller.ts',
    './relationships/videos-merge.controller.ts',
    '../services/video-merge-orchestration.service.ts',
  ])('keeps %s below 500 lines', (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    expect(source.trimEnd().split('\n').length).toBeLessThan(500);
  });
});
