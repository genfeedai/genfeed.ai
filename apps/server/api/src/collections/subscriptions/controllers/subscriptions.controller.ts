import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateSubscriptionPreviewDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { ConfigService } from '@api/config/config.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import type {
  IChangePriceBodyParams,
  JsonApiCollectionResponse,
} from '@genfeedai/interfaces';
import { SubscriptionSerializer } from '@genfeedai/serializers';
import { SubscriptionPlan } from '@genfeedai/enums';
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
} from '@nestjs/common';
import type { Request } from 'express';
import type { PipelineStage } from 'mongoose';

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

// All of the Stripe logic is handled in the webhooks/stripe/webhooks.stripe.service.ts file because we have a portal for the user to manage their subscription

@AutoSwagger()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly configService: ConfigService,
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

      const aggregate: PipelineStage[] = [
        {
          $match: {
            isDeleted,
          },
        },
        {
          $sort: { createdAt: -1 },
        },
      ];

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
    @CurrentUser() user: User,
    @Body() changeData: IChangePriceBodyParams,
  ): Promise<SubscriptionMutationResponse> {
    const publicMetadata = getPublicMetadata(user);

    try {
      const result = await this.subscriptionsService.changeSubscriptionPlan(
        publicMetadata.organization,
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
  ): Promise<CreditsBreakdownResponse> {
    try {
      const organizationId = user.publicMetadata.organization as string;

      const [creditsData, subscription] = await Promise.all([
        this.creditsUtilsService.getOrganizationCreditsWithExpiration(
          organizationId,
        ),
        this.subscriptionsService.findByOrganizationId(organizationId),
      ]);

      let planLimit = 0;
      if (subscription?.type === SubscriptionPlan.YEARLY) {
        planLimit =
          Number(this.configService.get('STRIPE_YEARLY_CREDITS')) || 500_000;
      } else if (subscription?.type === SubscriptionPlan.MONTHLY) {
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

  private getCycleWindow(
    subscription: {
      type?: SubscriptionPlan;
      currentPeriodEnd?: Date;
    } | null,
  ): { cycleStartAt: Date; cycleEndAt: Date } | null {
    if (!subscription?.currentPeriodEnd || !subscription.type) {
      return null;
    }

    const cycleEndAt = new Date(subscription.currentPeriodEnd);
    const cycleStartAt = new Date(cycleEndAt);

    if (subscription.type === SubscriptionPlan.MONTHLY) {
      cycleStartAt.setMonth(cycleStartAt.getMonth() - 1);
      return { cycleEndAt, cycleStartAt };
    }

    if (subscription.type === SubscriptionPlan.YEARLY) {
      cycleStartAt.setFullYear(cycleStartAt.getFullYear() - 1);
      return { cycleEndAt, cycleStartAt };
    }

    return null;
  }
}
