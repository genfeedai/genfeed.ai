import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateLiveSessionDto } from '@api/collections/videos/dto/create-live-session.dto';
import { LiveSessionCreditsService } from '@api/collections/videos/services/live-session-credits.service';
import type { RequestWithContext as ExpressRequest } from '@api/common/middleware/request-context.middleware';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  ActivitySource,
  LiveSessionTerminateReason,
  MemberRole,
  ModelCategory,
} from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { LiveSessionSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  SetMetadata,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard)
export class VideosLiveSessionsController {
  constructor(
    private readonly liveSessionCreditsService: LiveSessionCreditsService,
  ) {}

  @Post('live-sessions')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @Credits({
    description: 'Live session',
    source: ActivitySource.VIDEO_GENERATION,
  })
  @DeferCreditsUntilModelResolution()
  @ValidateModel({ category: ModelCategory.VIDEO })
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @UseInterceptors(CreditsInterceptor)
  @RateLimit({ limit: 30, scope: 'organization', windowMs: 60 * 1000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async openSession(
    @Req() request: ExpressRequest,
    @Body() dto: CreateLiveSessionDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const session = await this.liveSessionCreditsService.openSession({
      dto,
      request,
      user,
    });
    return serializeSingle(request, LiveSessionSerializer, session);
  }

  @Get('live-sessions/:sessionId')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getSession(
    @Req() request: ExpressRequest,
    @CurrentUser() user: User,
    @Param('sessionId') sessionId: string,
  ): Promise<JsonApiSingleResponse> {
    const session = await this.liveSessionCreditsService.getSession({
      organizationId: user.organizationId,
      sessionId,
      userId: user.userId,
    });
    return serializeSingle(request, LiveSessionSerializer, session);
  }

  @Post('live-sessions/:sessionId/terminate')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async terminateSession(
    @Req() request: ExpressRequest,
    @CurrentUser() user: User,
    @Param('sessionId') sessionId: string,
  ): Promise<JsonApiSingleResponse> {
    const session = await this.liveSessionCreditsService.terminateSession({
      organizationId: user.organizationId,
      reason: LiveSessionTerminateReason.USER,
      sessionId,
      userId: user.userId,
    });
    return serializeSingle(request, LiveSessionSerializer, session);
  }
}
