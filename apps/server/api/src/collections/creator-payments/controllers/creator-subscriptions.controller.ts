import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  SetCreatorSubscriptionCancelDto,
  SubscribeToCreatorDto,
  UpdateCreatorSubscriptionPlanDto,
} from '@api/collections/creator-payments/dto/creator-subscription.dto';
import { CreatorSubscriptionsService } from '@api/collections/creator-payments/services/creator-subscriptions.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BrandScopeQueryDto } from '@api/helpers/dto/brand-scope-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import type {
  ICreatorSubscriptionOffer,
  ICreatorSubscriptionPlan,
  ICreatorSubscriptionSummary,
} from '@genfeedai/contracts/interfaces/billing';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

@AutoSwagger()
@Controller('creator-payments/subscriptions')
@UseGuards(RolesGuard)
export class CreatorSubscriptionsController {
  constructor(
    private readonly creatorSubscriptionsService: CreatorSubscriptionsService,
  ) {}

  /** The organization's public brands with their monthly price and subscribers. */
  @Get('plans')
  @RequiredScopes(ApiKeyScope.CREDITS_READ)
  async listPlans(
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
  ): Promise<ICreatorSubscriptionPlan[]> {
    const { organizationId } = extractRequestContext(user, query);
    return this.creatorSubscriptionsService.listPlans(organizationId);
  }

  /** Set a public brand's monthly price; owners and admins only. */
  @Put('plans/:brandId')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async updatePlan(
    @Param('brandId') brandId: string,
    @Body() body: UpdateCreatorSubscriptionPlanDto,
    @CurrentUser() user: User,
  ): Promise<ICreatorSubscriptionPlan> {
    const { organizationId } = extractRequestContext(user);
    return this.creatorSubscriptionsService.updatePlan(
      organizationId,
      brandId,
      body,
    );
  }

  /** The signed-in reader's paid subscriptions. */
  @Get('mine')
  @RequiredScopes(ApiKeyScope.CREDITS_READ)
  async listMine(
    @CurrentUser() user: User,
  ): Promise<ICreatorSubscriptionSummary[]> {
    const { organizationId, userId } = extractRequestContext(user);
    return this.creatorSubscriptionsService.listMine({
      organizationId,
      userId,
    });
  }

  /** What a creator offers the reader, and whether they already subscribe. */
  @Get('offers/:handle')
  async getOffer(
    @Param('handle') handle: string,
    @CurrentUser() user: User,
  ): Promise<ICreatorSubscriptionOffer> {
    const { organizationId, userId } = extractRequestContext(user);
    return this.creatorSubscriptionsService.getOffer(
      { organizationId, userId },
      handle,
    );
  }

  /** Subscribe and pay the first month from the reader's organization. */
  @Post()
  // Spends the organization's credits: a person's session, or an admin key.
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async subscribe(
    @Body() body: SubscribeToCreatorDto,
    @CurrentUser() user: User,
  ): Promise<ICreatorSubscriptionSummary> {
    const { organizationId, userId } = extractRequestContext(user);
    return this.creatorSubscriptionsService.subscribe(
      { organizationId, userId },
      body,
    );
  }

  /** Cancel at period end, or keep the subscription after all. */
  @Patch(':subscriptionId')
  @RequiredScopes(ApiKeyScope.ADMIN)
  async setCancelAtPeriodEnd(
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: SetCreatorSubscriptionCancelDto,
    @CurrentUser() user: User,
  ): Promise<ICreatorSubscriptionSummary> {
    const { organizationId, userId } = extractRequestContext(user);
    return this.creatorSubscriptionsService.setCancelAtPeriodEnd(
      { organizationId, userId },
      subscriptionId,
      body.cancelAtPeriodEnd,
    );
  }
}
