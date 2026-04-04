import { StreakCalendarQueryDto } from '@api/collections/streaks/dto/streak-calendar-query.dto';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
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
  ) {
    this.assertUserOrgAccess(organizationId, user);
    const publicMetadata = getPublicMetadata(user);
    return this.streaksService.getStreakSummary(
      String(publicMetadata.user),
      organizationId,
    );
  }

  @Get('me/calendar')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMyCalendar(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: StreakCalendarQueryDto,
  ) {
    this.assertUserOrgAccess(organizationId, user);
    const publicMetadata = getPublicMetadata(user);

    return this.streaksService.getCalendar(
      String(publicMetadata.user),
      organizationId,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  @Post('me/freeze')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async useFreeze(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
  ) {
    this.assertUserOrgAccess(organizationId, user);
    const publicMetadata = getPublicMetadata(user);
    const streak = await this.streaksService.useFreeze(
      String(publicMetadata.user),
      organizationId,
    );

    return {
      message: 'Freeze applied. Your streak is safe for today.',
      streakFreezes: streak.streakFreezes,
    };
  }

  private assertUserOrgAccess(organizationId: string, user: User): void {
    const publicMetadata = getPublicMetadata(user);

    if (String(publicMetadata.organization) !== organizationId) {
      throw new BadRequestException('Organization mismatch');
    }
  }
}
