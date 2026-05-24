import { CreateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/create-monitored-account.dto';
import { MonitoredAccountsQueryDto } from '@api/collections/monitored-accounts/dto/monitored-accounts-query.dto';
import { UpdateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/update-monitored-account.dto';
import { ValidateTwitterUsernameDto } from '@api/collections/monitored-accounts/dto/validate-twitter-username.dto';
import type { MonitoredAccountDocument } from '@api/collections/monitored-accounts/schemas/monitored-account.schema';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import { MonitoredAccountSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Monitored Accounts')
@AutoSwagger()
@Controller('monitored-accounts')
export class MonitoredAccountsController extends BaseCRUDController<
  MonitoredAccountDocument,
  CreateMonitoredAccountDto,
  UpdateMonitoredAccountDto,
  // @ts-expect-error TS2344
  MonitoredAccountsQueryDto
> {
  constructor(
    public readonly monitoredAccountsService: MonitoredAccountsService,
    public readonly loggerService: LoggerService,
    private readonly apifyService: ApifyService,
  ) {
    super(
      loggerService,
      monitoredAccountsService,
      MonitoredAccountSerializer,
      'MonitoredAccount',
      ['organization', 'brand', 'user', 'credential', 'botConfig'],
    );
  }

  public buildFindAllQuery(user: User, query: MonitoredAccountsQueryDto) {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    // Always filter by organization for multi-tenancy
    const organizationId =
      query.organization || publicMetadata.organization?.toString();
    if (organizationId) {
      match.organization = organizationId;
    }

    if (query.brand) {
      match.brand = query.brand;
    } else if (publicMetadata.brand) {
      match.brand = publicMetadata.brand;
    }

    // Filter by bot config if provided
    if (query.botConfig) {
      match.botConfig = query.botConfig;
    }

    // Filter by active status if provided
    if (query.isActive !== undefined) {
      match.isActive = query.isActive;
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where: match,
    };
  }

  public canUserModifyEntity(user: User, entity: unknown): boolean {
    const publicMetadata = getPublicMetadata(user);
    const entityRecord = entity as {
      organization?: { _id?: { toString?: () => string } } | string | null;
      brand?: { _id?: { toString?: () => string } } | string | null;
    };

    const entityOrganizationId =
      (typeof entityRecord.organization === 'object' &&
      entityRecord.organization !== null
        ? entityRecord.organization._id?.toString?.()
        : undefined) ||
      (typeof entityRecord.organization === 'string'
        ? entityRecord.organization
        : undefined);
    const entityBrandId =
      (typeof entityRecord.brand === 'object' && entityRecord.brand !== null
        ? entityRecord.brand._id?.toString?.()
        : undefined) ||
      (typeof entityRecord.brand === 'string' ? entityRecord.brand : undefined);
    if (
      entityOrganizationId &&
      publicMetadata.organization &&
      entityOrganizationId === publicMetadata.organization &&
      (!publicMetadata.brand || entityBrandId === publicMetadata.brand)
    ) {
      return true;
    }

    return Boolean(publicMetadata?.isSuperAdmin);
  }

  /**
   * Toggle the active status of a monitored account
   */
  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle account active status' })
  @ApiResponse({
    description: 'Account status toggled successfully',
    status: 200,
  })
  async toggleActive(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const account = await this.monitoredAccountsService.toggleActive(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );
    return serializeSingle(req, MonitoredAccountSerializer, account);
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const data = await this.monitoredAccountsService.findOne({
      ...(publicMetadata.brand ? { brand: publicMetadata.brand } : {}),
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    return serializeSingle(request, MonitoredAccountSerializer, data);
  }

  /**
   * Validate a Twitter username and fetch user details
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate Twitter username and fetch details' })
  @ApiResponse({
    description: 'Returns Twitter user details if valid',
    status: 200,
  })
  async validateTwitterUsername(
    @Body() body: ValidateTwitterUsernameDto,
  ): Promise<{
    valid: boolean;
    id?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    followersCount?: number;
    bio?: string;
    error?: string;
  }> {
    try {
      // Fetch the user's timeline with limit=1 to validate the account exists
      const tweets = await this.apifyService.getTwitterUserTimeline(
        body.username,
        { limit: 1 },
      );

      if (!tweets || tweets.length === 0) {
        return { error: 'Account not found or has no tweets', valid: false };
      }

      const firstTweet = tweets[0];

      return {
        avatarUrl: firstTweet.authorAvatarUrl,
        displayName: firstTweet.authorDisplayName,
        followersCount: firstTweet.authorFollowersCount,
        id: firstTweet.authorId,
        username: firstTweet.authorUsername,
        valid: true,
      };
    } catch (error: unknown) {
      this.loggerService.error('Failed to validate Twitter username', {
        error: (error as Error)?.message,
        username: body.username,
      });

      return {
        error: 'Failed to validate username',
        valid: false,
      };
    }
  }
}
