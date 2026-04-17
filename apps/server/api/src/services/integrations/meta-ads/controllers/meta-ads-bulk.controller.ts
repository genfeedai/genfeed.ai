import type {
  BulkUploadStatus,
  CreativeSource,
} from '@api/collections/ad-bulk-upload-jobs/schemas/ad-bulk-upload-job.schema';
import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  extractRequestContext,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { AdBulkUploadService } from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
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

@AutoSwagger()
@Controller('services/meta-ads/bulk')
export class MetaAdsBulkController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly adBulkUploadService: AdBulkUploadService,
    private readonly adBulkUploadJobsService: AdBulkUploadJobsService,
    private readonly credentialsService: CredentialsService,
  ) {}

  @Post('upload')
  async createBulkUpload(
    @CurrentUser() user: User,
    @Body() body: CreateBulkUploadBody,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);

    return this.adBulkUploadService.createBulkUpload({
      accessToken: await this.getAccessTokenFromCredential(user),
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
      videos: body.videos,
    });
  }

  @Get('jobs')
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
  async getJobStatus(@CurrentUser() user: User, @Param('id') id: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);
    const job = await this.adBulkUploadJobsService.findById(
      id,
      ctx.organizationId,
    );

    if (!job) {
      throw new NotFoundException(`Bulk upload job ${id} not found`);
    }

    return job;
  }

  @Post('jobs/:id/cancel')
  async cancelJob(@CurrentUser() user: User, @Param('id') id: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ctx = extractRequestContext(user);
    const job = await this.adBulkUploadJobsService.findById(
      id,
      ctx.organizationId,
    );

    if (!job) {
      throw new NotFoundException(`Bulk upload job ${id} not found`);
    }

    await this.adBulkUploadJobsService.updateStatus(id, 'cancelled');
    return { success: true };
  }

  private async getAccessTokenFromCredential(user: User): Promise<string> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization as string;
    const userId = publicMetadata.user as string;

    const credential = await this.credentialsService.findOne({
      isConnected: true,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.FACEBOOK,
      user: new Types.ObjectId(userId),
    });

    if (!credential?.accessToken) {
      throw new NotFoundException(
        'Facebook credential not found. Please connect your Facebook account first.',
      );
    }

    return EncryptionUtil.decrypt(credential.accessToken);
  }
}
