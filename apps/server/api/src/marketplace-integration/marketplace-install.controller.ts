import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import { Controller, Param, Post } from '@nestjs/common';

@AutoSwagger()
@Controller('marketplace-installs')
export class MarketplaceInstallController {
  constructor(
    private readonly marketplaceInstallService: MarketplaceInstallService,
  ) {}

  @Post(':listingId')
  async install(
    @Param('listingId') listingId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const result = await this.marketplaceInstallService.installToWorkspace(
      listingId,
      publicMetadata.user,
      publicMetadata.organization,
    );

    return { data: result };
  }
}
