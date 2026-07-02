import { randomUUID } from 'node:crypto';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { AdOptimizationJobData } from '@api/queues/ad-optimization/ad-optimization-job.interface';
import type { MetaAdSyncJobData } from '@api/queues/ad-sync-meta/ad-sync-meta-job.interface';
import type { TikTokAdSyncJobData } from '@api/queues/ad-sync-tiktok/ad-sync-tiktok-job.interface';
import { QueueService } from '@api/queues/core/queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { TikTokAdsService } from '@api/services/integrations/tiktok-ads/services/tiktok-ads.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import type { GoogleAdSyncJobData } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type AdAutomationAction =
  | 'adOptimization'
  | 'adSyncGoogle'
  | 'adSyncMeta'
  | 'adSyncTikTok';

export interface AdAutomationWorkflowResult {
  action: AdAutomationAction;
  enqueued: number;
  organizationId: string;
  queueName?: string;
  reason?: string;
  runId?: string;
  skipped: number;
  status: 'enqueued' | 'skipped';
}

const AD_OPTIMIZATION_QUEUE = 'ad-optimization';
const AD_SYNC_GOOGLE_QUEUE = 'ad-sync-google';
const AD_SYNC_META_QUEUE = 'ad-sync-meta';
const AD_SYNC_TIKTOK_QUEUE = 'ad-sync-tiktok';

const DAILY_LOCK_TTL_SECONDS = 36 * 60 * 60;
const MAX_PROVIDER_SYNC_JITTER_MS = 30 * 60 * 1000;
const MAX_OPTIMIZATION_JITTER_MS = 15 * 60 * 1000;

@Injectable()
export class AdAutomationWorkflowService {
  private readonly logContext = 'AdAutomationWorkflowService';

  constructor(
    private readonly logger: LoggerService,
    private readonly queueService: QueueService,
    private readonly cacheService: CacheService,
    private readonly credentialsService: CredentialsService,
    private readonly adPerformanceService: AdPerformanceService,
    private readonly optimizationConfigService: AdOptimizationConfigsService,
    private readonly metaAdsService: MetaAdsService,
    private readonly googleAdsService: GoogleAdsService,
    private readonly tikTokAdsService: TikTokAdsService,
  ) {}

  async runAdOptimization(
    organizationId: string,
  ): Promise<AdAutomationWorkflowResult> {
    const acquired = await this.acquireExecutionLock(
      'adOptimization',
      organizationId,
      DAILY_LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      return this.skipped(
        'adOptimization',
        organizationId,
        'daily_ad_optimization_already_enqueued',
        AD_OPTIMIZATION_QUEUE,
      );
    }

    const config =
      await this.optimizationConfigService.findByOrganization(organizationId);

    if (!config?.isEnabled) {
      return this.skipped(
        'adOptimization',
        organizationId,
        'ad_optimization_config_disabled_or_missing',
        AD_OPTIMIZATION_QUEUE,
      );
    }

    const runId = randomUUID();
    const jobData: AdOptimizationJobData = {
      configId: String(config.id),
      organizationId,
      runId,
    };

    await this.queueService.add(AD_OPTIMIZATION_QUEUE, jobData, {
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      delay: this.randomDelay(MAX_OPTIMIZATION_JITTER_MS),
    });

    this.logger.log(`${this.logContext} enqueued ad optimization`, {
      organizationId,
      runId,
    });

    return {
      action: 'adOptimization',
      enqueued: 1,
      organizationId,
      queueName: AD_OPTIMIZATION_QUEUE,
      runId,
      skipped: 0,
      status: 'enqueued',
    };
  }

  async runMetaAdSync(
    organizationId: string,
  ): Promise<AdAutomationWorkflowResult> {
    const acquired = await this.acquireExecutionLock(
      'adSyncMeta',
      organizationId,
      DAILY_LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      return this.skipped(
        'adSyncMeta',
        organizationId,
        'daily_meta_ad_sync_already_enqueued',
        AD_SYNC_META_QUEUE,
      );
    }

    const credentials = await this.findConnectedCredentials(
      organizationId,
      CredentialPlatform.FACEBOOK,
    );

    let enqueued = 0;
    let skipped = 0;

    for (const credential of credentials) {
      const didEnqueue = await this.enqueueMetaCredentialSync(
        organizationId,
        credential,
      );
      if (didEnqueue) {
        enqueued++;
      } else {
        skipped++;
      }
    }

    return this.syncResult(
      'adSyncMeta',
      organizationId,
      AD_SYNC_META_QUEUE,
      enqueued,
      skipped,
      credentials.length === 0 ? 'no_connected_meta_credentials' : undefined,
    );
  }

  async runGoogleAdSync(
    organizationId: string,
  ): Promise<AdAutomationWorkflowResult> {
    const acquired = await this.acquireExecutionLock(
      'adSyncGoogle',
      organizationId,
      DAILY_LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      return this.skipped(
        'adSyncGoogle',
        organizationId,
        'daily_google_ad_sync_already_enqueued',
        AD_SYNC_GOOGLE_QUEUE,
      );
    }

    const credentials = await this.findConnectedCredentials(
      organizationId,
      CredentialPlatform.GOOGLE_ADS,
    );

    let enqueued = 0;
    let skipped = 0;

    for (const credential of credentials) {
      const didEnqueue = await this.enqueueGoogleCredentialSync(
        organizationId,
        credential,
      );
      if (didEnqueue) {
        enqueued++;
      } else {
        skipped++;
      }
    }

    return this.syncResult(
      'adSyncGoogle',
      organizationId,
      AD_SYNC_GOOGLE_QUEUE,
      enqueued,
      skipped,
      credentials.length === 0
        ? 'no_connected_google_ads_credentials'
        : undefined,
    );
  }

  async runTikTokAdSync(
    organizationId: string,
  ): Promise<AdAutomationWorkflowResult> {
    const acquired = await this.acquireExecutionLock(
      'adSyncTikTok',
      organizationId,
      DAILY_LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      return this.skipped(
        'adSyncTikTok',
        organizationId,
        'daily_tiktok_ad_sync_already_enqueued',
        AD_SYNC_TIKTOK_QUEUE,
      );
    }

    const credentials = await this.findConnectedCredentials(
      organizationId,
      CredentialPlatform.TIKTOK,
    );

    let enqueued = 0;
    let skipped = 0;

    for (const credential of credentials) {
      const didEnqueue = await this.enqueueTikTokCredentialSync(
        organizationId,
        credential,
      );
      if (didEnqueue) {
        enqueued++;
      } else {
        skipped++;
      }
    }

    return this.syncResult(
      'adSyncTikTok',
      organizationId,
      AD_SYNC_TIKTOK_QUEUE,
      enqueued,
      skipped,
      credentials.length === 0 ? 'no_connected_tiktok_credentials' : undefined,
    );
  }

  private async enqueueMetaCredentialSync(
    organizationId: string,
    credential: CredentialDocument,
  ): Promise<boolean> {
    try {
      const accessToken = this.decryptOptional(credential.accessToken);
      const credentialId = String(credential.id);
      const brandId = this.readCredentialBrandId(credential);

      if (!accessToken || !brandId) {
        this.logger.warn(`${this.logContext} skipped Meta credential`, {
          credentialId,
          organizationId,
          reason: !accessToken ? 'missing_access_token' : 'missing_brand',
        });
        return false;
      }

      const adAccounts = await this.metaAdsService.getAdAccounts(accessToken);
      if (adAccounts.length === 0) {
        this.logger.log(`${this.logContext} no Meta ad accounts found`, {
          credentialId,
          organizationId,
        });
        return false;
      }

      const lastSyncDate =
        await this.adPerformanceService.findLatestSyncDateForCredential(
          credentialId,
        );

      const jobData: MetaAdSyncJobData = {
        accessToken,
        adAccountIds: adAccounts.map((account) => account.id),
        brandId,
        credentialId,
        lastSyncDate: lastSyncDate?.toISOString(),
        organizationId,
      };

      await this.queueService.add(AD_SYNC_META_QUEUE, jobData, {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
        delay: this.randomDelay(MAX_PROVIDER_SYNC_JITTER_MS),
      });

      return true;
    } catch (error) {
      this.logger.error(`${this.logContext} failed Meta ad sync enqueue`, {
        credentialId: credential.id,
        error,
        organizationId,
      });
      return false;
    }
  }

  private async enqueueGoogleCredentialSync(
    organizationId: string,
    credential: CredentialDocument,
  ): Promise<boolean> {
    try {
      const accessToken = this.decryptOptional(credential.accessToken);
      const refreshToken = this.decryptOptional(credential.refreshToken);
      const credentialId = String(credential.id);
      const brandId = this.readCredentialBrandId(credential);

      if (!accessToken || !refreshToken || !brandId) {
        this.logger.warn(`${this.logContext} skipped Google Ads credential`, {
          credentialId,
          organizationId,
          reason: this.missingReason({
            accessToken,
            brandId,
            refreshToken,
          }),
        });
        return false;
      }

      const customers =
        await this.googleAdsService.listAccessibleCustomers(accessToken);
      const customerIds = customers.map((customer) => customer.id);

      if (customerIds.length === 0) {
        this.logger.log(`${this.logContext} no Google Ads customers found`, {
          credentialId,
          organizationId,
        });
        return false;
      }

      const lastSyncDate =
        await this.adPerformanceService.findLatestSyncDateForCredential(
          credentialId,
        );

      const jobData: GoogleAdSyncJobData = {
        accessToken,
        brandId,
        credentialId,
        customerIds,
        lastSyncDate: lastSyncDate?.toISOString(),
        loginCustomerId:
          this.readOptionalString(credential.externalHandle) ?? undefined,
        organizationId,
        refreshToken,
      };

      await this.queueService.add(AD_SYNC_GOOGLE_QUEUE, jobData, {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
        delay: this.randomDelay(MAX_PROVIDER_SYNC_JITTER_MS),
      });

      return true;
    } catch (error) {
      this.logger.error(`${this.logContext} failed Google Ads sync enqueue`, {
        credentialId: credential.id,
        error,
        organizationId,
      });
      return false;
    }
  }

  private async enqueueTikTokCredentialSync(
    organizationId: string,
    credential: CredentialDocument,
  ): Promise<boolean> {
    try {
      const accessToken = this.decryptOptional(credential.accessToken);
      const credentialId = String(credential.id);
      const brandId = this.readCredentialBrandId(credential);

      if (!accessToken || !brandId) {
        this.logger.warn(`${this.logContext} skipped TikTok Ads credential`, {
          credentialId,
          organizationId,
          reason: this.missingReason({ accessToken, brandId }),
        });
        return false;
      }

      const adAccounts = await this.tikTokAdsService.getAdAccounts(accessToken);
      const advertiserIds = adAccounts.map((account) => account.advertiserId);

      if (advertiserIds.length === 0) {
        this.logger.log(`${this.logContext} no TikTok ad accounts found`, {
          credentialId,
          organizationId,
        });
        return false;
      }

      const lastSyncDate =
        await this.adPerformanceService.findLatestSyncDateForCredential(
          credentialId,
        );

      const jobData: TikTokAdSyncJobData = {
        accessToken,
        advertiserIds,
        brandId,
        credentialId,
        lastSyncDate: lastSyncDate?.toISOString(),
        organizationId,
      };

      await this.queueService.add(AD_SYNC_TIKTOK_QUEUE, jobData, {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
        delay: this.randomDelay(MAX_PROVIDER_SYNC_JITTER_MS),
      });

      return true;
    } catch (error) {
      this.logger.error(`${this.logContext} failed TikTok Ads sync enqueue`, {
        credentialId: credential.id,
        error,
        organizationId,
      });
      return false;
    }
  }

  private async findConnectedCredentials(
    organizationId: string,
    platform: CredentialPlatform,
  ): Promise<CredentialDocument[]> {
    const result = await this.credentialsService.findAll(
      {
        where: {
          accessToken: { not: null },
          brandId: { not: null },
          isConnected: true,
          isDeleted: false,
          organizationId,
          platform,
        },
      },
      { limit: 500, pagination: false },
    );

    return result.docs as CredentialDocument[];
  }

  private async acquireExecutionLock(
    action: AdAutomationAction,
    organizationId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    return this.cacheService.acquireLock(
      `workflow-ad-automation:${action}:${organizationId}:${this.utcDateKey()}`,
      ttlSeconds,
    );
  }

  private syncResult(
    action: AdAutomationAction,
    organizationId: string,
    queueName: string,
    enqueued: number,
    skipped: number,
    emptyReason?: string,
  ): AdAutomationWorkflowResult {
    if (enqueued === 0) {
      return this.skipped(
        action,
        organizationId,
        emptyReason ?? 'no_eligible_credentials_enqueued',
        queueName,
        skipped,
      );
    }

    return {
      action,
      enqueued,
      organizationId,
      queueName,
      skipped,
      status: 'enqueued',
    };
  }

  private skipped(
    action: AdAutomationAction,
    organizationId: string,
    reason: string,
    queueName?: string,
    skipped: number = 0,
  ): AdAutomationWorkflowResult {
    return {
      action,
      enqueued: 0,
      organizationId,
      queueName,
      reason,
      skipped,
      status: 'skipped',
    };
  }

  private decryptOptional(value: unknown): string | null {
    const encrypted = this.readOptionalString(value);
    if (!encrypted) {
      return null;
    }

    return EncryptionUtil.decrypt(encrypted);
  }

  private readCredentialBrandId(credential: CredentialDocument): string | null {
    return (
      this.readOptionalString(credential.brandId) ??
      this.readOptionalString(credential.brand)
    );
  }

  private readOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private missingReason(fields: Record<string, unknown>): string {
    return Object.entries(fields)
      .filter(([, value]) => !value)
      .map(([key]) => `missing_${key}`)
      .join(',');
  }

  private randomDelay(maxDelayMs: number): number {
    return Math.round(Math.random() * maxDelayMs);
  }

  private utcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
