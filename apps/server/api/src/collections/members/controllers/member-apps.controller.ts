import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import {
  isFounderOnlyNativeApp,
  isNativeSecondaryAppId,
  type NativeSecondaryAppId,
} from '@genfeedai/contracts/constants';
import type { MemberAppsResponse } from '@genfeedai/contracts/interfaces';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * #5502 personal native app installation for the caller's membership in their
 * session organization. Installing is presentation only: it never changes the
 * organization's module access, starts work or grants subscription or release
 * access, which every new piece of work checks on its own. Personal data is
 * never selected by query, so there is no tenant override here.
 */
@AutoSwagger()
@Controller('members/me/apps')
@UseGuards(RolesGuard)
export class MemberAppsController {
  constructor(private readonly membersService: MembersService) {}

  @TenantReadPolicy('owner')
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findInstalledApps(
    @CurrentUser() user: User,
  ): Promise<MemberAppsResponse> {
    const { organizationId, userId } = this.readMembershipScope(user);
    const installedAppIds = await this.membersService.findInstalledAppIds(
      organizationId,
      userId,
    );
    if (!installedAppIds) {
      throw new NotFoundException('Member');
    }
    return { installedAppIds };
  }

  @Put(':appId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async installApp(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('appId') appId: string,
  ): Promise<MemberAppsResponse> {
    const nativeAppId = this.readNativeAppId(appId);
    // Founder-only experiments are absent from the customer Store, so they
    // cannot be installed around it through the API either.
    if (
      isFounderOnlyNativeApp(nativeAppId) &&
      !getIsSuperAdmin(user, request)
    ) {
      throw new ForbiddenException(`${nativeAppId} is not available yet`);
    }
    return this.setAppInstalled(user, nativeAppId, true);
  }

  /** Uninstalling keeps projects, assets, workflows and history. */
  @Delete(':appId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  uninstallApp(
    @CurrentUser() user: User,
    @Param('appId') appId: string,
  ): Promise<MemberAppsResponse> {
    return this.setAppInstalled(user, this.readNativeAppId(appId), false);
  }

  private async setAppInstalled(
    user: User,
    appId: NativeSecondaryAppId,
    isInstalled: boolean,
  ): Promise<MemberAppsResponse> {
    const { organizationId, userId } = this.readMembershipScope(user);
    // Personal installation always belongs to the authenticated session,
    // including operator requests carrying a generic tenant query override.
    const installedAppIds = await runWithTenantContext(
      { organizationId },
      async () =>
        await this.membersService.setAppInstalled(
          organizationId,
          userId,
          appId,
          isInstalled,
        ),
    );
    if (!installedAppIds) {
      throw new NotFoundException('Member');
    }
    return { installedAppIds };
  }

  private readNativeAppId(appId: string): NativeSecondaryAppId {
    if (!isNativeSecondaryAppId(appId)) {
      throw new NotFoundException('App', appId);
    }
    return appId;
  }

  private readMembershipScope(user: User) {
    const userId = user.userId ?? user.id;
    if (!user.organizationId || !userId) {
      throw new BadRequestException('An active organization is required');
    }
    return { organizationId: user.organizationId, userId };
  }
}
