import { CreateCrunImageQuoteDto } from '@api/collections/images/dto/create-crun-image-quote.dto';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { CrunPreviewQuoteService } from '@api/services/integrations/crun/crun-preview-quote.service';
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

@Controller('images')
@UseGuards(RolesGuard)
export class CrunImageQuoteController {
  constructor(private readonly preview: CrunPreviewQuoteService) {}
  @Post('crun-quote')
  @HttpCode(200)
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @ValidateModel({ category: ModelCategory.IMAGE })
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
    @Body() dto: CreateCrunImageQuoteDto,
    @Req() request: RequestWithContext,
  ) {
    const record = await this.preview.quote(dto, request);
    return serializeSingle(request, CrunGenerationQuoteSerializer, record);
  }
}
