import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { readReplyBotCredentialId } from '@api/services/campaign/reply-bot-credential.util';
import {
  REPLY_BOT_POLLING_QUEUE,
  ReplyBotPollingJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

export { readReplyBotCredentialId } from '@api/services/campaign/reply-bot-credential.util';

export type ReplyBotPollTarget = {
  credentialId: string;
  organizationId: string;
};

@Injectable()
export class ReplyBotQueueService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectQueue(REPLY_BOT_POLLING_QUEUE)
    private readonly pollingQueue: Queue<ReplyBotPollingJobData>,
    @Optional()
    private readonly replyBotConfigsService: ReplyBotConfigsService,
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
      // One job per bound credential on an active config (X, YouTube, …).
      const targets = await this.getActivePollTargets();

      this.logger.log(`${url} starting`, {
        targetCount: targets.length,
      });

      for (const target of targets) {
        await this.queuePollingJob(target.organizationId, target.credentialId);
      }

      this.logger.log(`${url} completed`, {
        jobsQueued: targets.length,
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

      if (!job.id) {
        throw new Error('Polling queue did not return a job id');
      }
      return job.id;
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
        jobId: `reply-bot-poll-${organizationId}-${credentialId}-${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
  }

  /**
   * Active reply-bot configs → poll targets by their bound credential.
   * Dedupes identical org+credential pairs. Does not invent a Twitter
   * credential when the config has none — that config is skipped + warned.
   */
  private async getActivePollTargets(): Promise<ReplyBotPollTarget[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const activeConfigs = await this.replyBotConfigsService.findAllActive();
      if (activeConfigs.length === 0) {
        return [];
      }

      const seen = new Set<string>();
      const results: ReplyBotPollTarget[] = [];

      for (const config of activeConfigs) {
        const organizationId = config.organizationId?.toString();
        if (!organizationId) {
          continue;
        }

        const credentialId = readReplyBotCredentialId(config);
        if (!credentialId) {
          this.logger.warn(
            `${url} active reply-bot config missing credentialId`,
            {
              configId: config.id?.toString(),
              organizationId,
              platform: config.platform,
            },
          );
          continue;
        }

        const key = `${organizationId}:${credentialId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        results.push({ credentialId, organizationId });
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
