import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { BulkScheduleDto } from '@api/collections/schedules/dto/bulk-schedule.dto';
import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';
import { RepurposeContentDto } from '@api/collections/schedules/dto/repurpose.dto';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import type { User } from '@clerk/backend';
import { ScheduleSerializer } from '@genfeedai/serializers';
import { ActivitySource } from '@genfeedai/enums';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Schedules')
@Controller('schedules')
@UseInterceptors(CreditsInterceptor)
export class SchedulesController {
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  /**
   * Get optimal posting time
   */
  @Post('optimal')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Optimal schedule suggestion (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getOptimalTime(
    @Req() req: Request,
    @Body() dto: GetOptimalTimeDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.assertOrganizationCreditsAvailable(
      organization,
      await this.getDefaultTextMinimumCredits(),
    );
    let billedCredits = 0;
    const result = await this.schedulesService.getOptimalTime(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );
    this.finalizeDeferredCredits(req, billedCredits);
    return result;
  }

  /**
   * Bulk schedule content
   */
  @Post('bulk')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async bulkSchedule(@Body() dto: BulkScheduleDto, @CurrentUser() user: User) {
    const { organization } = getPublicMetadata(user);
    return await this.schedulesService.bulkSchedule(dto, organization, user.id);
  }

  /**
   * Get schedule calendar
   */
  @Get('calendar')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getCalendar(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const { organization } = getPublicMetadata(user);

    const startDate = start || new Date().toISOString();
    const endDate =
      end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const schedules = await this.schedulesService.getCalendar(
      organization,
      startDate,
      endDate,
    );

    return serializeCollection(req, ScheduleSerializer, { docs: schedules });
  }

  /**
   * Repurpose content
   */
  @Post('repurpose')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async repurposeContent(
    @Body() dto: RepurposeContentDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    return await this.schedulesService.repurposeContent(
      dto,
      organization,
      user.id,
    );
  }

  /**
   * Get repurposing status
   */
  @Get('repurpose/:id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getRepurposingStatus(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    return await this.schedulesService.getRepurposingStatus(id, organization);
  }

  private async assertOrganizationCreditsAvailable(
    organizationId: string,
    requiredCredits: number,
  ): Promise<void> {
    if (requiredCredits <= 0) {
      return;
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );

    if (hasCredits) {
      return;
    }

    const balance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );

    throw new HttpException(
      {
        detail: `Insufficient credits: ${requiredCredits} required, ${balance} available`,
        title: 'Insufficient credits',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private async getDefaultTextMinimumCredits(): Promise<number> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      return 0;
    }

    if (model.pricingType === 'per-token') {
      return getMinimumTextCredits(model);
    }

    return model.cost || 0;
  }

  private finalizeDeferredCredits(request: Request, amount: number): void {
    const reqWithCredits = request as Request & {
      creditsConfig?: {
        amount?: number;
        deferred?: boolean;
        maxOverdraftCredits?: number;
      };
    };

    if (!reqWithCredits.creditsConfig?.deferred) {
      return;
    }

    reqWithCredits.creditsConfig = {
      ...reqWithCredits.creditsConfig,
      amount,
      deferred: false,
      maxOverdraftCredits: SchedulesController.TEXT_MAX_OVERDRAFT_CREDITS,
    };
  }
}
