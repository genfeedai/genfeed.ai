import {
  CreatePublicYoutubeClipperDto,
  CreatePublicYoutubeClipperPreviewDto,
} from '@api/endpoints/public/controllers/youtube-clipper/public-youtube-clipper.dto';
import { PublicYoutubeClipperService } from '@api/endpoints/public/services/public-youtube-clipper.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { PublicYoutubeClipperToolSerializer } from '@genfeedai/serializers';
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
@Controller('public/youtube-clipper')
export class PublicYoutubeClipperController {
  constructor(private readonly service: PublicYoutubeClipperService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 3, scope: 'ip', windowMs: 60 * 60 * 1000 })
  async create(
    @Req() request: Request,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePublicYoutubeClipperDto,
  ): Promise<JsonApiSingleResponse> {
    const session = await this.service.create(dto.youtubeUrl, idempotencyKey);
    return serializeSingle(
      request,
      PublicYoutubeClipperToolSerializer,
      session,
    );
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
    return serializeSingle(
      request,
      PublicYoutubeClipperToolSerializer,
      session,
    );
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
    @Body() dto: CreatePublicYoutubeClipperPreviewDto,
  ): Promise<JsonApiSingleResponse> {
    const session = await this.service.requestPreview(
      previewToken,
      dto.recommendationId,
    );
    return serializeSingle(
      request,
      PublicYoutubeClipperToolSerializer,
      session,
    );
  }
}
