import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import { ApiKeyScope } from '@genfeedai/contracts';
import { Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

const BEARER_PATTERN = /^Bearer (\S+)$/i;

@AutoSwagger()
@Controller('marketplace-installs')
export class MarketplaceInstallController {
  constructor(
    private readonly marketplaceInstallService: MarketplaceInstallService,
  ) {}

  /**
   * Add an item from the caller's marketplace library to their workspace.
   * The caller's own bearer token is relayed to the marketplace, which
   * verifies it and the purchase before returning the payload.
   */
  @Post(':listingId')
  @RequiredScopes(ApiKeyScope.ADMIN)
  async install(
    @Param('listingId') listingId: string,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    const buyerToken =
      request.headers.authorization?.match(BEARER_PATTERN)?.[1];

    const result = await this.marketplaceInstallService.installToWorkspace(
      listingId,
      user.userId ?? user.id,
      user.organizationId,
      buyerToken,
    );

    return { data: result };
  }
}
