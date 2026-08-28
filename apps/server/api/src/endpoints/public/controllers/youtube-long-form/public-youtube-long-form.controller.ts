import { CreatePublicYoutubeLongFormDto } from '@api/endpoints/public/controllers/youtube-long-form/public-youtube-long-form.dto';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { PublicYoutubeLongFormToolSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { Body, Controller, Header, Post, Req } from '@nestjs/common';
import { YoutubeLongFormWorkflowService } from '@server/collections/workflows/services/youtube-long-form-workflow.service';
import type { Request } from 'express';

@AutoSwagger()
@Controller('public/youtube-long-form')
export class PublicYoutubeLongFormController {
  constructor(
    private readonly youtubeLongFormWorkflow: YoutubeLongFormWorkflowService,
  ) {}

  @Post()
  @Public()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 3, scope: 'ip', windowMs: 60 * 60 * 1000 })
  async create(
    @Req() request: Request,
    @Body() dto: CreatePublicYoutubeLongFormDto,
  ): Promise<JsonApiSingleResponse> {
    const result = await this.youtubeLongFormWorkflow.runPublic(
      dto.youtubeUrl,
      dto.outputType,
    );
    return serializeSingle(request, PublicYoutubeLongFormToolSerializer, {
      ...result,
      id: result.contentId,
    });
  }
}
