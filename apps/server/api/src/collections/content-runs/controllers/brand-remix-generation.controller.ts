import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  ExecuteBrandRemixGenerationDto,
  QuoteBrandRemixGenerationDto,
} from '@api/collections/content-runs/dto/brand-remix-generation.dto';
import { BrandRemixGenerationService } from '@api/collections/content-runs/services/brand-remix-generation.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ActivitySource } from '@genfeedai/contracts';
import { ContentRunSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

@Controller()
export class BrandRemixGenerationController {
  constructor(private readonly generation: BrandRemixGenerationService) {}

  @Post('content-runs/:id/remix/generation/quote')
  @UseGuards(SubscriptionGuard)
  async quote(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: QuoteBrandRemixGenerationDto,
  ) {
    return serializeSingle(
      request,
      ContentRunSerializer,
      await this.generation.quote(user.organizationId, id, user, body),
    );
  }

  @Post('content-runs/:id/remix/generation/execute')
  @Credits({
    description: 'Brand remix generation',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  async execute(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: ExecuteBrandRemixGenerationDto,
  ) {
    return serializeSingle(
      request,
      ContentRunSerializer,
      await this.generation.execute(
        user.organizationId,
        id,
        user,
        request,
        body,
      ),
    );
  }
}
