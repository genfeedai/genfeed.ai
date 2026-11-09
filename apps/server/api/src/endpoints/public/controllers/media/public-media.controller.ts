import { PublicMediaViewsDto } from '@api/endpoints/public/dto/public-media-views.dto';
import { PublicMediaService } from '@api/endpoints/public/services/public-media.service';
import {
  PublicViewsService,
  type PublicVisitor,
} from '@api/endpoints/public/services/public-views.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type {
  IMediaProvenanceManifest,
  IPublicMediaRouteReference,
} from '@genfeedai/contracts/interfaces';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

function visitorOf(request: Request): PublicVisitor {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip ?? '',
    userAgent: typeof userAgent === 'string' ? userAgent : '',
  };
}

@AutoSwagger()
@Public()
@Controller('public/media')
export class PublicMediaController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly publicMediaService: PublicMediaService,
    private readonly publicViewsService: PublicViewsService,
  ) {}

  /**
   * Counts the public images and videos a gallery visitor saw, once a day
   * each, and returns their counts. Ids that are not public are left out.
   */
  @Post('views')
  @RateLimit({ limit: 30, scope: 'ip', windowMs: 60_000 })
  async recordViews(
    @Req() request: Request,
    @Body() body: PublicMediaViewsDto,
  ): Promise<{ data: { views: Record<string, number> } }> {
    const views = await this.publicViewsService.recordMediaViews(
      body.ids.filter((id) => isEntityId(id)),
      visitorOf(request),
    );
    return { data: { views } };
  }

  /** Counts a click on Recreate in Genfeed, once a day per visitor. */
  @Post(':assetId/recreations')
  @RateLimit({ limit: 30, scope: 'ip', windowMs: 60_000 })
  async recordRecreation(
    @Req() request: Request,
    @Param('assetId') assetId: string,
  ): Promise<{ data: { recreations: number } | null }> {
    if (!isEntityId(assetId)) {
      return { data: null };
    }
    const recreations = await this.publicViewsService.recordRecreation(
      assetId,
      visitorOf(request),
    );
    return { data: recreations === null ? null : { recreations } };
  }

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
