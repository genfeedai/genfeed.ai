import { ChangePlanDto } from '@api/collections/subscriptions/dto/change-plan.dto';
import { CreateSubscriptionPreviewDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { SubscriptionPlan } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  OrganizationCreditUsageResponse,
  SubscriptionChangePreview,
} from '@genfeedai/interfaces';
import { SubscriptionSerializer } from '@genfeedai/serializers';
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
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@server/collections/organizations/services/organizations.service';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import { BaseQueryDto } from '@server/helpers/dto/base-query.dto';
import { customLabels } from '@server/helpers/utils/pagination.util';
import type { Request } from 'express';

interface SubscriptionMutationResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

/** Minimal subscription projection used by the admin credit-usage list. */
interface SubscriptionRowSource {
  id: string;
  organizationId: string;
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
    private readonly creditGrantService: SubscriptionCreditGrantService,
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
    // Request context tracks the active organization; token metadata can lag
    // behind an organization switch and bill the wrong tenant.
    const organizationId =
      request.context?.organizationId ?? user.organizationId;

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
  ): Promise<SubscriptionMutationResponse<SubscriptionChangePreview>> {
    try {
      const result = await this.subscriptionsService.previewSubscriptionChange(
        user.organizationId,
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
      // Middleware-injected context takes priority over JWT identity
      // because context reflects the active org after any org-switching
      const organizationId =
        request.context?.organizationId ?? user.organizationId ?? '';

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

      // planLimit is the meter's denominator, so it reports what this
      // subscription's own Stripe price includes. An unresolvable price leaves
      // it at 0 and the meter renders no percentage rather than a fictional one.
      const planLimit =
        (await this.creditGrantService.resolvePlanCredits(
          subscription?.plan,
          subscription?.stripePriceId,
        )) ?? 0;

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

  private async buildCreditUsageRow(
    subscription: SubscriptionRowSource,
    organizationNameById: Map<string, string>,
  ): Promise<OrganizationCreditUsageResponse['data'][number]> {
    const organizationId = subscription.organizationId;

    const tier = this.creditGrantService.resolveTierFromPriceId(
      subscription.stripePriceId,
    );
    const planLimit =
      (await this.creditGrantService.resolveMonthlyCredits(
        subscription.stripePriceId,
      )) ?? 0;

    const balance = organizationId
      ? await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        )
      : 0;

    // A price with no resolvable grant reports 0% used rather than dividing by
    // zero; the admin list shows the row so the gap is visible, not hidden.
    const usedCredits = planLimit > 0 ? Math.max(0, planLimit - balance) : 0;
    const usedPercent =
      planLimit > 0
        ? Math.min(100, Math.max(0, (usedCredits / planLimit) * 100))
        : 0;
    const remainingPercent = 100 - usedPercent;

    return {
      balance,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toISOString()
        : null,
      isMaxedOut: usedPercent >= 90,
      isUnderUsing: planLimit > 0 && usedPercent <= 10,
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
    } | null,
  ): { cycleStartAt: Date; cycleEndAt: Date } | null {
    const subscriptionPlan = subscription?.plan;
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
