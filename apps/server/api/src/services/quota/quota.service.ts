import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { type OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { postExecutionStateReadFilter } from '@api-types/contracts/scheduler.contract';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  TargetExecutionState,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export interface QuotaCheckResult {
  allowed: boolean;
  currentCount: number;
  dailyLimit: number;
  platform: string;
}

/** Platform to settings field mapping for quota lookups */
type QuotaSettingsKey =
  | 'quotaYoutube'
  | 'quotaTiktok'
  | 'quotaTwitter'
  | 'quotaInstagram';

const PLATFORM_QUOTA_FIELDS: Partial<
  Record<CredentialPlatform, QuotaSettingsKey>
> = {
  [CredentialPlatform.YOUTUBE]: 'quotaYoutube',
  [CredentialPlatform.TIKTOK]: 'quotaTiktok',
  [CredentialPlatform.TWITTER]: 'quotaTwitter',
  [CredentialPlatform.INSTAGRAM]: 'quotaInstagram',
};

@Injectable()
export class QuotaService {
  private readonly constructorName = this.constructor.name;
  private postsService!: PostsService;

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly organizationsService: OrganizationsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly moduleRef: ModuleRef,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Lazy-load PostsService via ModuleRef to break circular dependency
   * QuotaModule ↔ PostsModule
   */
  private getPostsService(): PostsService {
    const postsService =
      this.postsService ?? this.moduleRef.get(PostsService, { strict: false });

    if (!postsService) {
      throw new Error('PostsService not available');
    }

    this.postsService = postsService;
    return postsService;
  }

  /**
   * Check if a credential has remaining quota for posting today
   * Counts posts created today in the Posts collection
   */
  async checkQuota(
    credential: CredentialDocument,
    organization: OrganizationDocument,
  ): Promise<QuotaCheckResult> {
    const settings = await this.organizationSettingsService.findOne({
      organizationId: organization.id.toString(),
    });

    if (!settings) {
      throw new HttpException(
        {
          detail: 'Organization settings not found',
          title: 'Organization settings not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const platform = fromPrismaCredentialPlatform(
      String(credential.platform ?? ''),
    );
    if (!platform) {
      throw new HttpException(
        {
          detail: `Unknown credential platform: ${credential.platform}`,
          title: 'Unknown credential platform',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const quotaField = PLATFORM_QUOTA_FIELDS[platform];
    const dailyLimit = quotaField ? (settings[quotaField] as number) || 0 : 0;

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);

    const currentCount = await this.getPostsService().count(
      organization.id.toString(),
      {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        credentialId: credential.id.toString(),
        platform,
        ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
      },
    );

    const result: QuotaCheckResult = {
      allowed: currentCount < dailyLimit,
      currentCount,
      dailyLimit,
      platform,
    };

    this.logger.log(`${this.constructorName} Quota check for ${platform}`, {
      credentialId: credential.id,
      ...result,
    });

    return result;
  }

  /**
   * Verify quota and throw exception if exceeded
   * Use this in controllers/services where you want to block the operation
   */
  async verifyQuota(
    credential: CredentialDocument,
    organizationId: string,
  ): Promise<void> {
    const organization = await this.organizationsService.findOne({
      id: organizationId,
    });

    if (!organization) {
      throw new HttpException(
        {
          detail: 'Organization not found',
          title: 'Organization not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const quotaCheck = await this.checkQuota(credential, organization);

    if (!quotaCheck.allowed) {
      throw new HttpException(
        {
          code: 'QUOTA_EXCEEDED',
          detail: `You have reached the daily limit for ${quotaCheck.platform} (${quotaCheck.currentCount}/${quotaCheck.dailyLimit} posts today). Quota resets at midnight UTC.`,
          meta: {
            currentCount: quotaCheck.currentCount,
            dailyLimit: quotaCheck.dailyLimit,
            platform: quotaCheck.platform,
          },
          title: 'Daily posting quota exceeded',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Get quota status for a credential (for UI display)
   */
  async getQuotaStatus(
    credentialId: string,
    organizationId: string,
  ): Promise<QuotaCheckResult | null> {
    try {
      const credential = await this.credentialsService.findOne({
        id: credentialId,
      });
      const organization = await this.organizationsService.findOne({
        id: organizationId,
      });

      if (!credential || !organization) {
        return null;
      }

      return this.checkQuota(credential, organization);
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} Error getting quota status`,
        error,
      );
      return null;
    }
  }
}
