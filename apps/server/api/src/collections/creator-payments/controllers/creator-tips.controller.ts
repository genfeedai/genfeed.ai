import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SendCreatorTipDto } from '@api/collections/creator-payments/dto/send-creator-tip.dto';
import { CreatorTipsService } from '@api/collections/creator-payments/services/creator-tips.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ApiKeyScope } from '@genfeedai/contracts';
import type {
  ICreatorTipResult,
  ICreatorTipTarget,
} from '@genfeedai/contracts/interfaces/billing';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';

@AutoSwagger()
@Controller('creator-payments/tips')
export class CreatorTipsController {
  constructor(private readonly creatorTipsService: CreatorTipsService) {}

  /** The creator a tip page is about to pay, and whether the reader may. */
  @Get(':handle')
  async getTarget(
    @Param('handle') handle: string,
    @CurrentUser() user: User,
  ): Promise<ICreatorTipTarget> {
    const { organizationId, userId } = extractRequestContext(user);
    return this.creatorTipsService.getTarget(
      { organizationId, userId },
      handle,
    );
  }

  /** Send credits from the reader's organization to the creator. */
  @Post()
  // Spends the organization's credits: a person's session, or an admin key.
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async tip(
    @Body() body: SendCreatorTipDto,
    @CurrentUser() user: User,
  ): Promise<ICreatorTipResult> {
    const { organizationId, userId } = extractRequestContext(user);
    return this.creatorTipsService.tip({ organizationId, userId }, body);
  }
}
