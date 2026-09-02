import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { EmailDigestWorkflowService } from '@api/collections/content-performance/services/email-digest-workflow.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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
  constructor(
    private readonly analyticsSyncService: AnalyticsSyncService,
    private readonly analyticsWorkflow: AnalyticsSyncWorkflowService,
    private readonly emailDigestWorkflow: EmailDigestWorkflowService,
  ) {}

  /**
   * Trigger analytics sync — enqueues a background job to sync platform analytics
   * into the closed-loop performance system.
   */
  @Post('trigger')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async triggerSync(@Body() dto: TriggerSyncDto, @CurrentUser() user: User) {
    const organizationId = user.organizationId;

    const job = await this.analyticsWorkflow.queueGenericSync({
      brandId: dto.brandId,
      organizationId,
      since: dto.since,
      userId: user.userId ?? user.id,
    });

    return {
      jobId: job.jobId,
      message: 'Analytics workflow enqueued',
      status: 'queued',
      workflowId: job.workflowId,
    };
  }

  /**
   * Start the same action-backed workflow used by scheduled analytics sync.
   */
  @Post('run')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async runSync(@Body() dto: TriggerSyncDto, @CurrentUser() user: User) {
    const organizationId = user.organizationId;

    return this.analyticsWorkflow.queueGenericSync({
      brandId: dto.brandId,
      organizationId,
      since: dto.since,
      userId: user.userId ?? user.id,
    });
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
    const organizationId = user.organizationId;

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
    const organizationId = user.organizationId;

    const jobId = await this.emailDigestWorkflow.enqueue({
      brandId: dto.brandId,
      endDate: dto.endDate,
      organizationId,
      recipientEmails: dto.recipientEmails,
      startDate: dto.startDate,
      userId: user.userId ?? user.id,
    });

    return {
      jobId,
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
    const organizationId = user.organizationId;

    const result = await this.emailDigestWorkflow.run({
      brandId: dto.brandId,
      endDate: dto.endDate,
      organizationId,
      recipientEmails: dto.recipientEmails,
      startDate: dto.startDate,
      userId: user.userId ?? user.id,
    });

    return result;
  }
}
