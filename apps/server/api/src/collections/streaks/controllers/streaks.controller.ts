import { StreakCalendarQueryDto } from '@api/collections/streaks/dto/streak-calendar-query.dto';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';

@AutoSwagger()
@Controller('organizations/:organizationId/streaks')
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  @Get('me')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMyStreak(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Req() request: RequestWithContext,
  ) {
    const resolvedOrganizationId = this.assertUserOrgAccess(
      organizationId,
      user,
      request,
    );
    return this.streaksService.getStreakSummary(
      this.resolveUserId(user, request),
      resolvedOrganizationId,
    );
  }

  @Get('me/calendar')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMyCalendar(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Req() request: RequestWithContext,
    @Query() query: StreakCalendarQueryDto,
  ) {
    const resolvedOrganizationId = this.assertUserOrgAccess(
      organizationId,
      user,
      request,
    );

    return this.streaksService.getCalendar(
      this.resolveUserId(user, request),
      resolvedOrganizationId,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  @Post('me/freeze')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async useFreeze(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Req() request: RequestWithContext,
  ) {
    const resolvedOrganizationId = this.assertUserOrgAccess(
      organizationId,
      user,
      request,
    );
    const streak = await this.streaksService.useFreeze(
      this.resolveUserId(user, request),
      resolvedOrganizationId,
    );

    return {
      message: 'Freeze applied. Your streak is safe for today.',
      streakFreezes: streak.streakFreezes,
    };
  }

  private resolveOrganizationId(
    user: User,
    request: RequestWithContext,
  ): string {
    const publicMetadata = getPublicMetadata(user);

    return String(
      request.context?.organizationId ?? publicMetadata.organization ?? '',
    );
  }

  private resolveUserId(user: User, request: RequestWithContext): string {
    const publicMetadata = getPublicMetadata(user);

    return String(request.context?.userId ?? publicMetadata.user ?? '');
  }

  private assertUserOrgAccess(
    organizationId: string,
    user: User,
    request: RequestWithContext,
  ): string {
    const resolvedOrganizationId = this.resolveOrganizationId(user, request);

    if (!resolvedOrganizationId) {
      throw new BadRequestException('Organization mismatch');
    }

    if (request.context?.organizationId) {
      return resolvedOrganizationId;
    }

    if (resolvedOrganizationId !== organizationId) {
      throw new BadRequestException('Organization mismatch');
    }

    return resolvedOrganizationId;
  }
}
