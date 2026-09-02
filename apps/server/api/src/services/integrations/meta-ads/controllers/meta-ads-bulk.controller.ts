import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type {
  BulkUploadStatus,
  CreativeSource,
} from '@api/collections/ad-bulk-upload-jobs/schemas/ad-bulk-upload-job.schema';
import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { AdBulkUploadService } from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

interface CreateBulkUploadBody {
  credentialId: string;
  adAccountId: string;
  campaignId: string;
  adSetId: string;
  creativeSource: CreativeSource;
  images: string[];
  videos: string[];
  headlines: string[];
  bodyCopies: string[];
  callToAction?: string;
  linkUrl: string;
}

interface UpdateBulkUploadJobBody {
  status?: BulkUploadStatus;
}

@AutoSwagger()
@Controller('services/meta-ads/bulk')
@UseGuards(RolesGuard)
export class MetaAdsBulkController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly adBulkUploadService: AdBulkUploadService,
    private readonly adBulkUploadJobsService: AdBulkUploadJobsService,
  ) {}

  @Post('upload')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async createBulkUpload(
    @CurrentUser() user: User,
    @Body() body: CreateBulkUploadBody,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);

    return this.adBulkUploadService.createBulkUpload({
      adAccountId: body.adAccountId,
      adSetId: body.adSetId,
      bodyCopies: body.bodyCopies,
      brandId: ctx.brandId || undefined,
      callToAction: body.callToAction,
      campaignId: body.campaignId,
      creativeSource: body.creativeSource,
      credentialId: body.credentialId,
      headlines: body.headlines,
      images: body.images,
      linkUrl: body.linkUrl,
      organizationId: ctx.organizationId,
      userId: user.userId ?? user.id,
      videos: body.videos,
    });
  }

  @Get('jobs')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  async listJobs(
    @CurrentUser() user: User,
    @Query('status') status?: BulkUploadStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);

    return this.adBulkUploadJobsService.findByOrganization(ctx.organizationId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      status,
    });
  }

  @Get('jobs/:id')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  async getJobStatus(@CurrentUser() user: User, @Param('id') id: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);
    const job = await this.adBulkUploadJobsService.findById(
      id,
      ctx.organizationId,
    );

    if (!job) {
      throw new NotFoundException('Bulk upload job', id);
    }

    return job;
  }

  @Patch('jobs/:id')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async updateJob(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateBulkUploadJobBody,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);
    const job = await this.adBulkUploadJobsService.findById(
      id,
      ctx.organizationId,
    );

    if (!job) {
      throw new NotFoundException('Bulk upload job', id);
    }

    if (body.status !== undefined) {
      await this.adBulkUploadJobsService.updateStatus(id, body.status);
    }

    return { success: true };
  }
}
