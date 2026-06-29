import { PublicMediaService } from '@api/endpoints/public/services/public-media.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type {
  IMediaProvenanceManifest,
  IPublicMediaRouteReference,
} from '@genfeedai/interfaces';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, Header, Param } from '@nestjs/common';

@AutoSwagger()
@Public()
@Controller('public/media')
export class PublicMediaController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(private readonly publicMediaService: PublicMediaService) {}

  @Get(':assetId')
  @Cache({
    keyGenerator: (req) => `public:media:${req.params?.assetId ?? 'unknown'}`,
    tags: ['media', 'public'],
    ttl: 1800,
  })
  async resolveMedia(
    @Param('assetId') assetId: string,
  ): Promise<{ data: IPublicMediaRouteReference }> {
    if (!isEntityId(assetId)) {
      return returnNotFound(this.constructorName, assetId);
    }

    return { data: await this.publicMediaService.getRouteReference(assetId) };
  }

  @Get(':assetId/manifest.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Cache({
    keyGenerator: (req) =>
      `public:media:${req.params?.assetId ?? 'unknown'}:manifest`,
    tags: ['media', 'public'],
    ttl: 1800,
  })
  async getManifest(
    @Param('assetId') assetId: string,
  ): Promise<IMediaProvenanceManifest> {
    if (!isEntityId(assetId)) {
      return returnNotFound(this.constructorName, assetId);
    }

    return this.publicMediaService.getManifest(assetId);
  }

  @Get(':assetId/transcript.vtt')
  @Header('Content-Type', 'text/vtt; charset=utf-8')
  @Cache({
    keyGenerator: (req) =>
      `public:media:${req.params?.assetId ?? 'unknown'}:transcript`,
    tags: ['media', 'public'],
    ttl: 1800,
  })
  async getTranscript(@Param('assetId') assetId: string): Promise<string> {
    if (!isEntityId(assetId)) {
      return returnNotFound(this.constructorName, assetId);
    }

    return this.publicMediaService.getTranscriptVtt(assetId);
  }
}
