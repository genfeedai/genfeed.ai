import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { MarketplaceCreditPurchaseDto } from '@api/marketplace-integration/marketplace-credit-purchase.dto';
import { MarketplaceCreditPurchaseService } from '@api/marketplace-integration/marketplace-credit-purchase.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ApiKeyScope } from '@genfeedai/contracts';
import type { IMarketplaceCreditPurchaseResult } from '@genfeedai/contracts/interfaces/billing';
import { Body, Controller, Param, Post } from '@nestjs/common';

@AutoSwagger()
@Controller('marketplace-purchases')
export class MarketplacePurchaseController {
  constructor(
    private readonly marketplaceCreditPurchaseService: MarketplaceCreditPurchaseService,
  ) {}

  /** Pay for a listing with the signed-in buyer's organization credits. */
  @Post(':listingId/credits')
  // Spends the organization's credits: a person's session, or an admin key.
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async payWithCredits(
    @Param('listingId') listingId: string,
    @Body() body: MarketplaceCreditPurchaseDto,
    @CurrentUser() user: User,
  ): Promise<IMarketplaceCreditPurchaseResult> {
    const { organizationId, userId } = extractRequestContext(user);
    return this.marketplaceCreditPurchaseService.payWithCredits({
      idempotencyKey: body.idempotencyKey,
      listingId,
      organizationId,
      userId,
    });
  }
}
