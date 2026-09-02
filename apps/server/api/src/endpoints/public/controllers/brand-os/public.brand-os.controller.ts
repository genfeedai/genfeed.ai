import { BrandOsPreviewService } from '@api/collections/brands/services/brand-os-preview.service';
import { BrandOsPreviewDto } from '@api/endpoints/public/controllers/brand-os/brand-os-preview.dto';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { BrandOsPreviewSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('public/brand-os')
export class PublicBrandOsController {
  constructor(private readonly brandOsPreviewService: BrandOsPreviewService) {}

  @Post('preview')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 5, scope: 'ip', windowMs: 60_000 })
  async preview(
    @Req() request: Request,
    @Body() dto: BrandOsPreviewDto,
  ): Promise<JsonApiSingleResponse> {
    const preview = await this.brandOsPreviewService.createPreview(dto);
    return serializeSingle(request, BrandOsPreviewSerializer, preview);
  }
}
