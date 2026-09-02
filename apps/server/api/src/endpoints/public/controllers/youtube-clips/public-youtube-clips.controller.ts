import {
  CreatePublicYoutubeClipDto,
  CreatePublicYoutubeClipPreviewDto,
} from '@api/endpoints/public/controllers/youtube-clips/public-youtube-clips.dto';
import { PublicYoutubeClipsService } from '@api/endpoints/public/services/public-youtube-clips.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { PublicYoutubeClipToolSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('public/youtube-clips')
export class PublicYoutubeClipsController {
  constructor(private readonly service: PublicYoutubeClipsService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 3, scope: 'ip', windowMs: 60 * 60 * 1000 })
  async create(
    @Req() request: Request,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePublicYoutubeClipDto,
  ): Promise<JsonApiSingleResponse> {
    const session = await this.service.create(dto.youtubeUrl, idempotencyKey);
    return serializeSingle(request, PublicYoutubeClipToolSerializer, session);
  }

  @Get(':previewToken')
  @Public()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 60, scope: 'ip', windowMs: 60_000 })
  async read(
    @Req() request: Request,
    @Param('previewToken') previewToken: string,
  ): Promise<JsonApiSingleResponse> {
    const session = await this.service.read(previewToken);
    return serializeSingle(request, PublicYoutubeClipToolSerializer, session);
  }

  @Post(':previewToken/preview')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 1, scope: 'ip', windowMs: 60 * 60 * 1000 })
  async preview(
    @Req() request: Request,
    @Param('previewToken') previewToken: string,
    @Body() dto: CreatePublicYoutubeClipPreviewDto,
  ): Promise<JsonApiSingleResponse> {
    const session = await this.service.requestPreview(
      previewToken,
      dto.recommendationId,
    );
    return serializeSingle(request, PublicYoutubeClipToolSerializer, session);
  }
}
