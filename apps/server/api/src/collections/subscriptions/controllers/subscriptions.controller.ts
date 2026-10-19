import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ChangePlanDto } from '@api/collections/subscriptions/dto/change-plan.dto';
import { CreateSubscriptionPreviewDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import { SubscriptionBillingExceptionFilter } from '@api/collections/subscriptions/errors/subscription-billing-exception.filter';
import { toSubscriptionChangeException } from '@api/collections/subscriptions/errors/subscription-change-failure.util';
import { toSubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview-failure.util';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { SubscriptionPlan } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  OrganizationBillingResponse,
  SubscriptionChangePreview,
} from '@genfeedai/contracts/interfaces';
import { SubscriptionPlanChangeCreditsOutcome } from '@genfeedai/contracts/interfaces/billing';
import { SubscriptionSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
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
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

interface SubscriptionMutationResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
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

/**
 * Wraps a failed read without collapsing what it already knows.
 *
 * An exception that carries its own status keeps it: re-wrapping an
 * intentional 4xx as a 500 reported ordinary client state as a server fault
 * and paged error tracking for it. Anything else becomes a 500 whose body
 * carries no underlying message — `AllExceptionFilter` redacts those in
 * production, and a hand-built envelope must not undo that — while the cause
 * travels with the exception so error tracking keeps the diagnosis.
 */
function toReadFailure(error: unknown, message: string): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  return new HttpException(
    { message, success: false },
    HttpStatus.INTERNAL_SERVER_ERROR,
    {
      cause: error,
    },
  );
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

      const data = await this.readAsPlatformAdmin(
        async () => await this.subscriptionsService.findAll(aggregate, options),
      );

      return serializeCollection(request, SubscriptionSerializer, data);
    } catch (error: unknown) {
      throw toReadFailure(error, 'Failed to retrieve subscriptions');
    }
  }

  @Patch('current')
  @UseFilters(SubscriptionBillingExceptionFilter)
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
        // The plan change is durable either way; say so without claiming the
        // credit reset that did not happen.
        message:
          result.creditsOutcome === SubscriptionPlanChangeCreditsOutcome.FAILED
            ? 'Subscription plan changed; its credit allocation could not be reset and is being repaired'
            : 'Subscription plan changed successfully',
        success: true,
      };
    } catch (error: unknown) {
      // The service already classifies its own failures; anything else that
      // escapes becomes the same typed exception so the method filter always
      // renders a stable `code` plus retry contract instead of a raw message.
      throw toSubscriptionChangeException(error);
    }
  }

  @Post('current/preview')
  @UseFilters(SubscriptionBillingExceptionFilter)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async previewChange(
    @Req() request: RequestWithContext,
    @CurrentUser() user: User,
    @Body() subscriptionPreviewDto: CreateSubscriptionPreviewDto,
  ): Promise<SubscriptionMutationResponse<SubscriptionChangePreview>> {
    // Preview must price the same tenant that changePlan will bill.
    const organizationId =
      request.context?.organizationId ?? user.organizationId;

    try {
      const result = await this.subscriptionsService.previewSubscriptionChange(
        organizationId,
        subscriptionPreviewDto.price,
      );

      return {
        data: result,
        message: 'Preview generated successfully',
        success: true,
      };
    } catch (error: unknown) {
      // The service already classifies its own failures; anything else that
      // escapes becomes the same typed exception so the method filter always
      // renders a stable `code` plus retry contract instead of a raw message.
      throw toSubscriptionPreviewException(error);
    }
  }

  @TenantReadPolicy('mutating')
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
      throw toReadFailure(error, 'Failed to get credits breakdown');
    }
  }

  @Get('admin/billing')
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getAdminBilling(
    @Query() query: BaseQueryDto,
  ): Promise<OrganizationBillingResponse> {
    try {
      const { limit, page } = QueryDefaultsUtil.getPaginationDefaults(query);

      const paginated = await this.readAsPlatformAdmin(
        async () =>
          await this.subscriptionsService.findAdminBilling({ limit, page }),
      );

      return {
        data: paginated.docs,
        limit: paginated.limit,
        page: paginated.page,
        success: true,
        totalDocs: paginated.totalDocs,
        totalPages: paginated.totalPages,
      };
    } catch (error: unknown) {
      throw toReadFailure(error, 'Failed to retrieve organization billing');
    }
  }

  /**
   * The superadmin routes read every organization's subscription and wallet,
   * never the superadmin's own request tenant. Only these two superadmin-gated
   * handlers call it; every other route stays inside the request tenant.
   */
  private readAsPlatformAdmin<T>(work: () => Promise<T>): Promise<T> {
    return crossOrgUnsafe(async () => await work());
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
