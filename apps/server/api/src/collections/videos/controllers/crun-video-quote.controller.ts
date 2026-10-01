import { CreateCrunVideoQuoteDto } from '@api/collections/videos/dto/create-crun-video-quote.dto';
import { CrunVideoPreviewQuoteService } from '@api/collections/videos/services/crun-video-preview-quote.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { MemberRole, ModelCategory } from '@genfeedai/contracts';
import { CrunGenerationQuoteSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

@Controller('videos')
@UseGuards(RolesGuard)
export class CrunVideoQuoteController {
  constructor(private readonly preview: CrunVideoPreviewQuoteService) {}
  @Post('crun-quote')
  @HttpCode(200)
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @ValidateModel({ category: ModelCategory.VIDEO })
  @UseGuards(SubscriptionGuard, ModelsGuard)
  @RateLimit({ limit: 30, scope: 'organization', windowMs: 60000 })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async quote(
    @Body() dto: CreateCrunVideoQuoteDto,
    @Req() request: RequestWithContext,
  ) {
    const record = await this.preview.quote(dto, request);
    return serializeSingle(request, CrunGenerationQuoteSerializer, record);
  }
}
