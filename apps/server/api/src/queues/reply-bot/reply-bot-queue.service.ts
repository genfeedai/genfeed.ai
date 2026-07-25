import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  REPLY_BOT_POLLING_QUEUE,
  ReplyBotPollingJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class ReplyBotQueueService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectQueue(REPLY_BOT_POLLING_QUEUE)
    private readonly pollingQueue: Queue<ReplyBotPollingJobData>,
    @Optional()
    private readonly replyBotConfigsService: ReplyBotConfigsService,
    @Optional() private readonly credentialsService: CredentialsService,
    @Optional() private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger.log(`${this.constructorName} initialized`);
  }

  /**
   * Cron job to poll for new tweets every 5 minutes
   * Currently disabled - uncomment to enable
   */
  // @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledPolling(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Get all organizations with active reply bot configs
      const orgsWithActiveBots = await this.getOrganizationsWithActiveBots();

      this.logger.log(`${url} starting`, {
        organizationCount: orgsWithActiveBots.length,
      });

      for (const org of orgsWithActiveBots) {
        await this.queuePollingJob(org.organizationId, org.credentialId);
      }

      this.logger.log(`${url} completed`, {
        jobsQueued: orgsWithActiveBots.length,
      });
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  /**
   * Manually trigger polling for a specific organization
   */
  async triggerPolling(
    organizationId: string,
    credentialId: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const job = await this.queuePollingJob(organizationId, credentialId);

      this.logger.log(`${url} triggered`, {
        credentialId,
        jobId: job.id,
        organizationId,
      });

      return job.id!;
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Queue a polling job for an organization
   */
  private queuePollingJob(
    organizationId: string,
    credentialId: string,
  ): Promise<{ id?: string }> {
    return this.pollingQueue.add(
      'poll',
      {
        credentialId,
        organizationId,
      },
      {
        jobId: `reply-bot-poll-${organizationId}-${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
  }

  /**
   * Get all organizations that have active reply bot configs with valid Twitter credentials
   */
  private async getOrganizationsWithActiveBots(): Promise<
    Array<{ organizationId: string; credentialId: string }>
  > {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Drive the fan-out from the scarce entity — active bot configs — rather
      // than from every tenant. Scanning all organizations cost 2N+1 queries
      // per tick and discarded almost every org immediately; this is 2 queries
      // regardless of tenant count.
      const activeConfigs = await this.replyBotConfigsService.findAllActive();

      const organizationIds = [
        ...new Set(
          activeConfigs
            .map((config) => config.organizationId?.toString())
            .filter(
              (organizationId): organizationId is string => !!organizationId,
            ),
        ),
      ];

      if (organizationIds.length === 0) {
        return [];
      }

      const credentials = await this.credentialsService.find({
        isDeleted: false,
        organizationId: { in: organizationIds },
        platform: CredentialPlatform.TWITTER,
      });

      // First credential wins per organization, mirroring the `findOne` read
      // this replaced.
      const credentialIdByOrganizationId = new Map<string, string>();
      for (const credential of credentials) {
        const organizationId = credential.organizationId?.toString();
        const credentialId = credential.id?.toString();

        if (!organizationId || !credentialId) {
          continue;
        }

        if (!credentialIdByOrganizationId.has(organizationId)) {
          credentialIdByOrganizationId.set(organizationId, credentialId);
        }
      }

      const results: Array<{ organizationId: string; credentialId: string }> =
        [];

      for (const organizationId of organizationIds) {
        const credentialId = credentialIdByOrganizationId.get(organizationId);

        if (credentialId) {
          results.push({ credentialId, organizationId });
        } else {
          this.logger.warn(
            `${url} no Twitter credential found for org ${organizationId}`,
          );
        }
      }

      return results;
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      return [];
    }
  }

  /**
   * Get queue status for monitoring
   */
  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.pollingQueue.getWaitingCount(),
      this.pollingQueue.getActiveCount(),
      this.pollingQueue.getCompletedCount(),
      this.pollingQueue.getFailedCount(),
    ]);

    return { active, completed, failed, waiting };
  }

  /**
   * Pause the polling queue
   */
  async pausePolling(): Promise<void> {
    await this.pollingQueue.pause();
    this.logger.log(`${this.constructorName} polling paused`);
  }

  /**
   * Resume the polling queue
   */
  async resumePolling(): Promise<void> {
    await this.pollingQueue.resume();
    this.logger.log(`${this.constructorName} polling resumed`);
  }
}
