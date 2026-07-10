import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  extractRequestContext,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { AdBulkUploadService } from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import { CredentialPlatform, MemberRole } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
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
import type {
  BulkUploadStatus,
  CreativeSource,
} from '@server/collections/ad-bulk-upload-jobs/schemas/ad-bulk-upload-job.schema';
import { AdBulkUploadJobsService } from '@server/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';

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
    private readonly credentialsService: CredentialsService,
  ) {}

  @Post('upload')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
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
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
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

  private async getAccessTokenFromCredential(user: User): Promise<string> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization as string;
    const userId = publicMetadata.user as string;

    const credential = await this.credentialsService.findOne({
      isConnected: true,
      isDeleted: false,
      organization: organizationId,
      platform: CredentialPlatform.FACEBOOK,
      user: userId,
    });

    if (!credential?.accessToken) {
      throw new NotFoundException({
        message:
          'Facebook credential not found. Please connect your Facebook account first.',
      });
    }

    return EncryptionUtil.decrypt(credential.accessToken);
  }
}
