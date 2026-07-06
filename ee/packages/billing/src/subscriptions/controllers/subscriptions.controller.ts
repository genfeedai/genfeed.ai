import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { SubscriptionPlan, SubscriptionTier } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  OrganizationCreditUsageResponse,
} from '@genfeedai/interfaces';
import { TIER_INCLUDED_MONTHLY_CREDITS } from '@genfeedai/pricing';
import { SubscriptionSerializer } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ChangePlanDto } from '../dto/change-plan.dto';
import type { CreateSubscriptionPreviewDto } from '../dto/create-subscription.dto';
import { SubscriptionsService } from '../services/subscriptions.service';

interface SubscriptionMutationResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

/** Minimal shape read off a normalized subscription document for the admin
 * credit-usage list. `organizationId` is the real scalar FK — the `organization`
 * field on SubscriptionDocument is a legacy Mongo-era alias that is undefined
 * at runtime (see .agents/memory/rules/prisma_legacy_alias_fields.md). */
interface SubscriptionRowSource {
  id: string;
  organizationId?: string;
  organization?: unknown;
  stripePriceId?: string | null;
  status?: string | null;
  currentPeriodEnd?: Date | null;
}

interface CreditsBreakdownResponse {
  success: boolean;
  data: {
    total: number;
    planLimit: number;
    cycleTotal: number;
    remainingPercent: number;
    cycleStartAt?: Date;
    cycleEndAt?: Date;
    credits: Array<{
      balance: number;
      expiresAt?: Date;
      source?: string;
      createdAt?: Date;
    }>;
  };
}

// All of the Stripe logic is handled in the webhooks/stripe/webhooks.stripe.service.ts file because we have a portal for the user to manage their subscription

@AutoSwagger()
@Controller('subscriptions')
@UseGuards(RolesGuard)
export class SubscriptionsController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get()
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    try {
      const options = {
        customLabels,
        ...QueryDefaultsUtil.getPaginationDefaults(query),
      };

      const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

      const aggregate = {
        where: {
          isDeleted,
        },
        orderBy: { createdAt: -1 },
      };

      const data = await this.subscriptionsService.findAll(aggregate, options);

      return serializeCollection(request, SubscriptionSerializer, data);
    } catch (error: unknown) {
      throw new HttpException(
        {
          error: (error as Error)?.message,
          message: 'Failed to retrieve subscriptions',
          success: false,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch('current')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async changePlan(
    @Req() request: RequestWithContext,
    @CurrentUser() user: User,
    @Body() changeData: ChangePlanDto,
  ): Promise<SubscriptionMutationResponse> {
    // request.context tracks the ACTIVE organization; legacy auth provider publicMetadata
    // can lag behind an org switch and bill the wrong org.
    const organizationId =
      request.context?.organizationId ?? getPublicMetadata(user).organization;

    try {
      const result = await this.subscriptionsService.changeSubscriptionPlan(
        organizationId,
        changeData.newPriceId,
      );

      return {
        data: result,
        message: 'Subscription plan changed successfully',
        success: true,
      };
    } catch (error: unknown) {
      throw new HttpException(
        {
          error: (error as Error)?.message,
          message: 'Failed to change subscription plan',
          success: false,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('current/preview')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async previewChange(
    @CurrentUser() user: User,
    @Body() subscriptionPreviewDto: CreateSubscriptionPreviewDto,
  ): Promise<SubscriptionMutationResponse> {
    const publicMetadata = getPublicMetadata(user);

    try {
      const result = await this.subscriptionsService.previewSubscriptionChange(
        publicMetadata.organization,
        subscriptionPreviewDto.price,
      );

      return {
        data: result,
        message: 'Preview generated successfully',
        success: true,
      };
    } catch (error: unknown) {
      throw new HttpException(
        {
          error: (error as Error)?.message,
          message: 'Failed to generate preview',
          success: false,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('current/credits')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getCreditsBreakdown(
    @CurrentUser() user: User,
    @Req() request: RequestWithContext,
  ): Promise<CreditsBreakdownResponse> {
    try {
      // Middleware-injected context takes priority over JWT publicMetadata
      // because context reflects the active org after any org-switching
      const organizationId =
        request.context?.organizationId ??
        getPublicMetadata(user).organization ??
        '';

      if (!organizationId) {
        throw new HttpException(
          'Organization ID is required to retrieve credits',
          HttpStatus.BAD_REQUEST,
        );
      }

      const [creditsData, subscription] = await Promise.all([
        this.creditsUtilsService.getOrganizationCreditsWithExpiration(
          organizationId,
        ),
        this.subscriptionsService.findByOrganizationId(organizationId),
      ]);

      let planLimit = 0;
      const subscriptionPlan =
        typeof subscription?.type === 'string'
          ? subscription.type
          : typeof subscription?.plan === 'string'
            ? subscription.plan
            : undefined;

      if (subscriptionPlan === SubscriptionPlan.YEARLY) {
        planLimit =
          Number(this.configService.get('STRIPE_YEARLY_CREDITS')) || 500_000;
      } else if (subscriptionPlan === SubscriptionPlan.MONTHLY) {
        planLimit =
          Number(this.configService.get('STRIPE_MONTHLY_CREDITS')) || 35_000;
      }

      const cycleWindow = this.getCycleWindow(subscription ?? null);
      const cycleMetrics = cycleWindow
        ? await this.creditsUtilsService.getCycleRemainingMetrics(
            organizationId,
            cycleWindow.cycleStartAt,
            cycleWindow.cycleEndAt,
            creditsData.total,
          )
        : {
            cycleTotal: creditsData.total,
            remainingPercent: creditsData.total > 0 ? 100 : 0,
          };

      return {
        data: {
          ...creditsData,
          ...cycleMetrics,
          cycleEndAt: cycleWindow?.cycleEndAt,
          cycleStartAt: cycleWindow?.cycleStartAt,
          planLimit,
        },
        success: true,
      };
    } catch (error: unknown) {
      throw new HttpException(
        {
          error: (error as Error)?.message,
          message: 'Failed to get credits breakdown',
          success: false,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('admin/credit-usage')
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getCreditUsage(
    @Query() query: BaseQueryDto,
  ): Promise<OrganizationCreditUsageResponse> {
    try {
      const options = {
        customLabels,
        ...QueryDefaultsUtil.getPaginationDefaults(query),
      };

      const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

      const aggregate = {
        where: { isDeleted },
        orderBy: { createdAt: -1 },
      };

      const paginated = await this.subscriptionsService.findAll(
        aggregate,
        options,
      );

      const subscriptions =
        paginated.docs as unknown as SubscriptionRowSource[];

      if (
        paginated.totalDocs > subscriptions.length &&
        paginated.page === 1 &&
        !options.pagination
      ) {
        this._loggerService.warn(
          'SubscriptionsController.getCreditUsage result truncated by pagination',
          { returned: subscriptions.length, totalDocs: paginated.totalDocs },
        );
      }

      const organizationIds = Array.from(
        new Set(
          subscriptions
            .map((subscription) => subscription.organizationId)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const organizations = organizationIds.length
        ? await this.organizationsService.find({
            id: { in: organizationIds },
            isDeleted: false,
          })
        : [];

      const organizationNameById = new Map<string, string>(
        organizations.map((organization) => [
          String((organization as { id: string }).id),
          String(
            (organization as { name?: string; label?: string }).name ??
              (organization as { name?: string; label?: string }).label ??
              'N/A',
          ),
        ]),
      );

      const data = await Promise.all(
        subscriptions.map((subscription) =>
          this.buildCreditUsageRow(subscription, organizationNameById),
        ),
      );

      return {
        data,
        limit: paginated.limit,
        page: paginated.page ?? 1,
        success: true,
        totalDocs: paginated.totalDocs,
        totalPages: paginated.totalPages,
      };
    } catch (error: unknown) {
      throw new HttpException(
        {
          error: (error as Error)?.message,
          message: 'Failed to retrieve organization credit usage',
          success: false,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Resolve a Stripe price ID to a credit-allotment tier. Reimplemented locally
   * (rather than injecting StripeWebhookSupportService, which lives in
   * apps/server/api/src/endpoints/webhooks/stripe/handlers/ and is not wired
   * into this EE billing module's provider graph) to avoid a new cross-package
   * DI dependency for four ConfigService lookups.
   */
  private resolveTierFromPriceId(
    stripePriceId: string | null | undefined,
  ): SubscriptionTier | null {
    if (!stripePriceId) {
      return null;
    }

    const priceToTier: Record<string, SubscriptionTier> = {};
    const proPrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY',
    );
    const proYearlyPrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY',
    );
    const scalePrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY',
    );
    const enterprisePrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY',
    );

    if (proPrice) {
      priceToTier[proPrice] = SubscriptionTier.PRO;
    }
    if (proYearlyPrice) {
      priceToTier[proYearlyPrice] = SubscriptionTier.PRO;
    }
    if (scalePrice) {
      priceToTier[scalePrice] = SubscriptionTier.SCALE;
    }
    if (enterprisePrice) {
      priceToTier[enterprisePrice] = SubscriptionTier.ENTERPRISE;
    }

    return priceToTier[stripePriceId] ?? null;
  }

  /** planLimit is never 0/undefined: tier-mapped credits win, otherwise the
   * STRIPE_MONTHLY_CREDITS config fallback (default 35_000, matching
   * getCreditsBreakdown's existing monthly fallback), guaranteeing safe
   * division in usedPercent. */
  private resolvePlanLimit(tier: SubscriptionTier | null): number {
    if (tier && TIER_INCLUDED_MONTHLY_CREDITS[tier]) {
      return TIER_INCLUDED_MONTHLY_CREDITS[tier];
    }

    return Number(this.configService.get('STRIPE_MONTHLY_CREDITS')) || 35_000;
  }

  private async buildCreditUsageRow(
    subscription: SubscriptionRowSource,
    organizationNameById: Map<string, string>,
  ): Promise<OrganizationCreditUsageResponse['data'][number]> {
    const organizationId =
      subscription.organizationId ?? String(subscription.organization ?? '');

    const tier = this.resolveTierFromPriceId(subscription.stripePriceId);
    const planLimit = this.resolvePlanLimit(tier);

    const balance = organizationId
      ? await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        )
      : 0;

    const usedCredits = Math.max(0, planLimit - balance);
    const usedPercent = Math.min(
      100,
      Math.max(0, (usedCredits / planLimit) * 100),
    );
    const remainingPercent = 100 - usedPercent;

    return {
      balance,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toISOString()
        : null,
      isMaxedOut: usedPercent >= 90,
      isUnderUsing: usedPercent <= 10,
      organizationId,
      organizationName: organizationNameById.get(organizationId) ?? 'N/A',
      planLimit,
      remainingPercent,
      status:
        (subscription.status as OrganizationCreditUsageResponse['data'][number]['status']) ??
        null,
      tier,
      usedCredits,
      usedPercent,
    };
  }

  private getCycleWindow(
    subscription: {
      currentPeriodEnd?: Date | null;
      plan?: string | null;
      type?: string | null;
    } | null,
  ): { cycleStartAt: Date; cycleEndAt: Date } | null {
    const subscriptionPlan = subscription?.type ?? subscription?.plan;
    if (!subscription?.currentPeriodEnd || !subscriptionPlan) {
      return null;
    }

    const cycleEndAt = new Date(subscription.currentPeriodEnd);
    const cycleStartAt = new Date(cycleEndAt);

    if (subscriptionPlan === SubscriptionPlan.MONTHLY) {
      cycleStartAt.setMonth(cycleStartAt.getMonth() - 1);
      return { cycleEndAt, cycleStartAt };
    }

    if (subscriptionPlan === SubscriptionPlan.YEARLY) {
      cycleStartAt.setFullYear(cycleStartAt.getFullYear() - 1);
      return { cycleEndAt, cycleStartAt };
    }

    return null;
  }
}
