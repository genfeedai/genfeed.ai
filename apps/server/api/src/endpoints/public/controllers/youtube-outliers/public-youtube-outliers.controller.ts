import { CreatePublicYoutubeOutliersDto } from '@api/endpoints/public/controllers/youtube-outliers/public-youtube-outliers.dto';
import { PublicYoutubeOutliersService } from '@api/endpoints/public/services/public-youtube-outliers.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { PublicYoutubeOutliersToolSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { Body, Controller, Header, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('public/youtube-outliers')
export class PublicYoutubeOutliersController {
  constructor(private readonly service: PublicYoutubeOutliersService) {}

  @Post()
  @Public()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 10, scope: 'ip', windowMs: 60 * 60 * 1000 })
  async create(
    @Req() request: Request,
    @Body() dto: CreatePublicYoutubeOutliersDto,
  ): Promise<JsonApiSingleResponse> {
    return serializeSingle(
      request,
      PublicYoutubeOutliersToolSerializer,
      await this.service.find(dto.channel),
    );
  }
}
