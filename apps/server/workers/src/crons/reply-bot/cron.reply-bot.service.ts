import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import type { IReplyBotCredentialData } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

interface ReplyBotCronTarget {
  organizationId: string;
  credentialId: string;
}

@Injectable()
export class CronReplyBotService {
  private static readonly LOCK_KEY = 'cron:reply-bot-polling';
  private static readonly LOCK_TTL_SECONDS = 600; // 10 minutes

  constructor(
    private readonly replyBotConfigsService: ReplyBotConfigsService,
    private readonly credentialsService: CredentialsService,
    private readonly replyBotOrchestratorService: ReplyBotOrchestratorService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async processReplyBots(): Promise<void> {
    const acquired = await this.cacheService.acquireLock(
      CronReplyBotService.LOCK_KEY,
      CronReplyBotService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      this.logger.debug(
        'Reply bot cron already running (lock held), skipping',
        'CronReplyBotService',
      );
      return;
    }

    const startTime = Date.now();

    try {
      const targets = await this.findActiveTargets();

      if (targets.length === 0) {
        this.logger.log(
          'No active reply bot configs found for polling',
          'CronReplyBotService',
        );
        return;
      }

      this.logger.log(
        `Starting reply bot polling cycle for ${targets.length} org/credential pairs`,
        'CronReplyBotService',
      );

      let botsProcessed = 0;
      let totalReplies = 0;
      let totalDms = 0;
      let totalErrors = 0;

      for (const target of targets) {
        try {
          const credential = await this.loadCredential(target);
          if (!credential) {
            totalErrors++;
            continue;
          }

          const results =
            await this.replyBotOrchestratorService.processOrganizationBots(
              target.organizationId,
              credential,
            );

          botsProcessed += results.length;
          totalReplies += results.reduce(
            (sum, result) => sum + result.repliesSent,
            0,
          );
          totalDms += results.reduce((sum, result) => sum + result.dmsSent, 0);
          totalErrors += results.reduce(
            (sum, result) => sum + result.errors,
            0,
          );
        } catch (error: unknown) {
          totalErrors++;
          this.logger.error(
            `Reply bot polling failed for organization ${target.organizationId}`,
            error,
            'CronReplyBotService',
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Reply bot polling cycle completed in ${duration}ms (${botsProcessed} bots, ${totalReplies} replies, ${totalDms} DMs, ${totalErrors} errors)`,
        'CronReplyBotService',
      );
    } catch (error: unknown) {
      this.logger.error(
        'Reply bot polling cycle failed',
        error,
        'CronReplyBotService',
      );
    } finally {
      await this.cacheService.releaseLock(CronReplyBotService.LOCK_KEY);
    }
  }

  private async findActiveTargets(): Promise<ReplyBotCronTarget[]> {
    const configs = await this.replyBotConfigsService.find({
      isActive: true,
      isDeleted: false,
    });

    const targets = new Map<string, ReplyBotCronTarget>();

    for (const config of configs) {
      const organizationId = config.organization?.toString();
      const credentialId = config.credential?.toString();

      if (!organizationId || !credentialId) {
        continue;
      }

      const key = `${organizationId}:${credentialId}`;
      if (!targets.has(key)) {
        targets.set(key, { credentialId, organizationId });
      }
    }

    return [...targets.values()];
  }

  private async loadCredential(
    target: ReplyBotCronTarget,
  ): Promise<IReplyBotCredentialData | null> {
    const credential = await this.credentialsService.findOne({
      _id: target.credentialId,
      isDeleted: false,
      organization: target.organizationId,
    });

    if (!credential) {
      this.logger.warn(
        `Skipping reply bot polling because credential ${target.credentialId} was not found for organization ${target.organizationId}`,
        'CronReplyBotService',
      );
      return null;
    }

    return {
      accessToken: credential.accessToken,
      accessTokenSecret: credential.accessTokenSecret,
      externalId: credential.externalId,
      platform: credential.platform,
      refreshToken: credential.refreshToken,
      username: credential.username,
    };
  }
}
