import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VideoUpscaleQuoteQueryDto } from '@api/collections/videos/dto/video-upscale-quote-query.dto';
import { VideoUpscaleQuoteService } from '@api/collections/videos/services/video-upscale-quote.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { VideoUpscaleQuoteSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * The credits an upscale of this video will cost at the chosen model,
 * resolution and frame rate. Priced by the same rules as the charge, so the
 * picker shows what the upscale will actually bill.
 */
@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard)
@OrganizationModule('playground')
export class VideosUpscaleQuoteController {
  constructor(private readonly quoteService: VideoUpscaleQuoteService) {}

  @Get(':videoId/upscale-quote')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findUpscaleQuote(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Query() query: VideoUpscaleQuoteQueryDto,
  ): Promise<JsonApiSingleResponse> {
    const { organizationId } = extractRequestContext(user);
    if (!organizationId) {
      throw new BadRequestException('An organization is required to quote');
    }

    const credits = await this.quoteService.quote(organizationId, videoId, {
      model: query.model,
      targetFps: query.targetFps ?? 30,
      targetResolution: query.targetResolution ?? '1080p',
    });

    return serializeSingle(request, VideoUpscaleQuoteSerializer, {
      credits,
      id: videoId,
    });
  }
}
