import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/create-monitored-account.dto';
import { MonitoredAccountsQueryDto } from '@api/collections/monitored-accounts/dto/monitored-accounts-query.dto';
import { UpdateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/update-monitored-account.dto';
import { ValidateTwitterUsernameDto } from '@api/collections/monitored-accounts/dto/validate-twitter-username.dto';
import type { MonitoredAccountDocument } from '@api/collections/monitored-accounts/schemas/monitored-account.schema';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
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
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    CollectionFilterUtil.applyAuthorizedTenantMatch(match, query, user);

    // Filter by bot config if provided
    if (query.botConfigId) {
      match.botConfigId = query.botConfigId;
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
    const entityRecord = entity as {
      organizationId?: string | null;
      brandId?: string | null;
    };

    const entityOrganizationId = entityRecord.organizationId;
    const entityBrandId = entityRecord.brandId;
    if (
      entityOrganizationId &&
      user.organizationId &&
      entityOrganizationId === user.organizationId &&
      (!user.brandId || entityBrandId === user.brandId)
    ) {
      return true;
    }

    return Boolean(user?.isSuperAdmin);
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const data = await this.monitoredAccountsService.findOne({
      ...(user.brandId ? { brandId: user.brandId } : {}),
      id: id,
      organizationId: user.organizationId,
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
