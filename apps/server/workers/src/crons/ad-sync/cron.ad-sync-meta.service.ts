import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { MetaAdSyncJobData } from '@api/queues/ad-sync-meta/ad-sync-meta.processor';
import { QueueService } from '@api/queues/core/queue.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class CronAdSyncMetaService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly QUEUE_NAME = 'ad-sync-meta';
  private readonly CHUNK_SIZE = 10;

  constructor(
    private readonly adPerformanceService: AdPerformanceService,
    private readonly credentialsService: CredentialsService,
    private readonly logger: LoggerService,
    private readonly metaAdsService: MetaAdsService,
    private readonly queueService: QueueService,
  ) {}

  @Cron('0 3 * * *') // 3 AM daily
  async syncMetaAds(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const credentialsResult = await this.credentialsService.findAll(
        {
          where: {
            accessToken: { not: null },
            brandId: { not: null },
            isConnected: true,
            isDeleted: false,
            organizationId: { not: null },
            platform: CredentialPlatform.FACEBOOK,
          },
        },
        { limit: 100, pagination: false },
      );

      const credentials = credentialsResult.docs as CredentialDocument[];

      if (credentials.length === 0) {
        this.logger.log(`${url} no connected Meta credentials found`);
        return;
      }

      for (const credential of credentials) {
        await this.enqueueCredentialAdSync(url, credential);
      }

      this.logger.log(`${url} completed scheduling`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  private async enqueueCredentialAdSync(
    url: string,
    credential: CredentialDocument,
  ): Promise<void> {
    try {
      if (!credential.accessToken) {
        this.logger.warn(`${url} skipping credential without access token`, {
          credentialId: credential._id,
        });
        return;
      }

      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const adAccounts = await this.metaAdsService.getAdAccounts(accessToken);

      if (adAccounts.length === 0) {
        this.logger.log(`${url} no ad accounts found for credential`, {
          credentialId: credential._id,
        });
        return;
      }

      const lastSyncDate =
        await this.adPerformanceService.findLatestSyncDateForCredential(
          String(credential._id),
        );

      await this.enqueueAdSyncJob({
        accessToken,
        adAccountIds: adAccounts.map((account) => account.id),
        brandId: credential.brand.toString(),
        credentialId: String(credential._id),
        lastSyncDate: lastSyncDate?.toISOString(),
        organizationId: credential.organization.toString(),
      });
    } catch (error: unknown) {
      this.logger.error(`${url} failed to enqueue credential sync`, error);
    }
  }

  async enqueueAdSyncJob(data: MetaAdSyncJobData): Promise<void> {
    const jitterMs = Math.random() * 30 * 60 * 1000;

    await this.queueService.add(this.QUEUE_NAME, data, {
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      delay: jitterMs,
    });

    this.logger.log(
      `${this.constructorName}: Enqueued Meta ad sync for org ${data.organizationId} with ${Math.round(jitterMs / 1000)}s jitter`,
    );
  }
}
