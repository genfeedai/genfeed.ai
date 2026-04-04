import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { QueueService } from '@api/queues/core/queue.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsEmail, IsOptional, IsString } from 'class-validator';

export class TriggerSyncDto {
  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsDateString()
  since?: string;
}

export class TriggerDigestDto {
  @IsString()
  brandId!: string;

  @IsOptional()
  @IsEmail({}, { each: true })
  recipientEmails?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

@AutoSwagger()
@Controller('content-performance/analytics-sync')
@UseGuards(RolesGuard)
export class AnalyticsSyncController {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly analyticsSyncService: AnalyticsSyncService,
    private readonly emailDigestService: EmailDigestService,
    private readonly queueService: QueueService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Trigger analytics sync — enqueues a background job to sync platform analytics
   * into the closed-loop performance system.
   */
  @Post('trigger')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async triggerSync(@Body() dto: TriggerSyncDto, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    const job = await this.queueService.add('analytics-sync', {
      brandId: dto.brandId,
      incremental: !dto.since,
      organizationId,
      since: dto.since,
    });

    return {
      jobId: job.id,
      message: 'Analytics sync job enqueued',
      status: 'queued',
    };
  }

  /**
   * Run analytics sync immediately (synchronous — for smaller datasets or testing).
   */
  @Post('run')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async runSync(@Body() dto: TriggerSyncDto, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    const lastSync = dto.since
      ? new Date(dto.since)
      : await this.analyticsSyncService.getLastSyncDate(
          organizationId,
          dto.brandId,
        );

    const result = await this.analyticsSyncService.syncAnalytics({
      brandId: dto.brandId,
      organizationId,
      since: lastSync ?? undefined,
    });

    return result;
  }

  /**
   * Get the last sync timestamp for this organization.
   */
  @Get('status')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getSyncStatus(
    @Query('brandId') brandId: string | undefined,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    const lastSyncDate = await this.analyticsSyncService.getLastSyncDate(
      organizationId,
      brandId,
    );

    return {
      lastSyncDate,
      organizationId,
    };
  }

  /**
   * Trigger email digest — enqueues a background job to send performance email.
   */
  @Post('digest')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async triggerDigest(
    @Body() dto: TriggerDigestDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    const job = await this.queueService.add('email-digest', {
      brandId: dto.brandId,
      endDate: dto.endDate,
      organizationId,
      recipientEmails: dto.recipientEmails,
      startDate: dto.startDate,
    });

    return {
      jobId: job.id,
      message: 'Email digest job enqueued',
      status: 'queued',
    };
  }

  /**
   * Send digest immediately (synchronous).
   */
  @Post('digest/send')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async sendDigest(@Body() dto: TriggerDigestDto, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    const result = await this.emailDigestService.sendDigest({
      brandId: dto.brandId,
      endDate: dto.endDate,
      organizationId,
      recipientEmails: dto.recipientEmails,
      startDate: dto.startDate,
    });

    return result;
  }
}
