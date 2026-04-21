import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import type { User } from '@clerk/backend';
import { ApiKeyCategory, ApiKeyScope } from '@genfeedai/enums';
import { Controller, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

/** All non-admin scopes granted to standard CLI keys */
const CLI_STANDARD_SCOPES: string[] = [
  ApiKeyScope.VIDEOS_READ,
  ApiKeyScope.VIDEOS_CREATE,
  ApiKeyScope.VIDEOS_UPDATE,
  ApiKeyScope.VIDEOS_DELETE,
  ApiKeyScope.IMAGES_READ,
  ApiKeyScope.IMAGES_CREATE,
  ApiKeyScope.IMAGES_UPDATE,
  ApiKeyScope.IMAGES_DELETE,
  ApiKeyScope.PROMPTS_READ,
  ApiKeyScope.PROMPTS_CREATE,
  ApiKeyScope.PROMPTS_UPDATE,
  ApiKeyScope.PROMPTS_DELETE,
  ApiKeyScope.ARTICLES_READ,
  ApiKeyScope.ARTICLES_CREATE,
  ApiKeyScope.BRANDS_READ,
  ApiKeyScope.CREDITS_READ,
  ApiKeyScope.POSTS_CREATE,
  ApiKeyScope.ANALYTICS_READ,
];

/** Admin CLI keys additionally receive the admin scope */
const CLI_ADMIN_SCOPES: string[] = [
  ...CLI_STANDARD_SCOPES,
  ApiKeyScope.ADMIN,
  ApiKeyScope.CREDITS_PROVISION,
];

/**
 * Auth CLI controller.
 * Provides a browser-authenticated endpoint that exchanges a Clerk JWT session
 * for a long-lived API key the CLI can store locally.
 *
 * Flow: CLI opens localhost callback server -> browser redirects here with
 * Clerk session -> endpoint returns plain API key -> CLI stores it.
 */
@ApiTags('Auth')
@Controller('auth')
@ApiBearerAuth()
export class AuthCliController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post('cli/token')
  @RateLimit({ limit: 5, scope: 'ip', windowMs: 60000 })
  @ApiOperation({
    summary: 'Exchange Clerk session for a CLI API key',
  })
  @ApiResponse({
    description: 'CLI API key created successfully',
    status: HttpStatus.CREATED,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @UseGuards(ClerkGuard)
  async createCliToken(
    @CurrentUser() user: User,
    @Req() request: Request,
  ): Promise<{ key: string }> {
    const publicMetadata = getPublicMetadata(user);
    const userId = publicMetadata.user;
    const organizationId = publicMetadata.organization;

    // Revoke any existing CLI key for this user
    const existingKeysPipeline = PipelineBuilder.create()
      .match({
        isRevoked: false,
        label: { $options: 'i', $regex: 'CLI' },
        organizationId,
        userId,
      })
      .build();

    const existingKeys = await this.apiKeysService.findAll(
      existingKeysPipeline,
      { limit: 100, page: 1 },
    );

    for (const existingKey of existingKeys.docs) {
      await this.apiKeysService.revoke(existingKey.id.toString());
    }

    // Determine scopes based on admin status
    const scopes = getIsSuperAdmin(user, request)
      ? CLI_ADMIN_SCOPES
      : CLI_STANDARD_SCOPES;

    const { plainKey } = await this.apiKeysService.createWithKey({
      category: ApiKeyCategory.GENFEEDAI,
      description: 'Auto-generated key for gf CLI',
      label: 'CLI',
      organizationId,
      scopes,
      userId,
    });

    return { key: plainKey };
  }
}
