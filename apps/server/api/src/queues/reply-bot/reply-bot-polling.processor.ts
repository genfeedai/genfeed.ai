import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import type { IReplyBotCredentialData } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import type {
  ReplyBotPollingJobData,
  ReplyBotPollingResult,
} from './reply-bot-polling-job.interface';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

@Processor('reply-bot-polling')
export class ReplyBotPollingProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly replyBotOrchestratorService: ReplyBotOrchestratorService,
    readonly _replyBotConfigsService: ReplyBotConfigsService,
    private readonly credentialsService: CredentialsService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'reply-bot-polling',
      this.logger,
    );
  }

  async process(
    job: Job<ReplyBotPollingJobData>,
  ): Promise<ReplyBotPollingResult> {
    try {
      return await this.circuitBreaker.execute(() => this.processInternal(job));
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn(error.message);
        throw error;
      }
      throw error;
    }
  }

  private buildCredentialData(credential: unknown): IReplyBotCredentialData {
    if (
      !isPlainObject(credential) ||
      typeof credential.accessToken !== 'string'
    ) {
      throw new Error('Reply bot credential missing accessToken');
    }

    return {
      accessToken: credential.accessToken,
      accessTokenSecret:
        typeof credential.accessTokenSecret === 'string'
          ? credential.accessTokenSecret
          : undefined,
      brandId:
        typeof credential.brandId === 'string' ? credential.brandId : undefined,
      externalId:
        typeof credential.externalId === 'string'
          ? credential.externalId
          : undefined,
      organizationId:
        typeof credential.organizationId === 'string'
          ? credential.organizationId
          : undefined,
      platform:
        typeof credential.platform === 'string'
          ? (credential.platform as IReplyBotCredentialData['platform'])
          : undefined,
      refreshToken:
        typeof credential.refreshToken === 'string'
          ? credential.refreshToken
          : undefined,
      username:
        typeof credential.externalHandle === 'string'
          ? credential.externalHandle
          : typeof credential.username === 'string'
            ? credential.username
            : undefined,
    };
  }

  private async processInternal(
    job: Job<ReplyBotPollingJobData>,
  ): Promise<ReplyBotPollingResult> {
    const { organizationId, credentialId } = job.data;

    this.logger.log(
      `Reply bot polling started for organization ${organizationId}`,
      {
        credentialId,
        jobId: job.id,
        organizationId,
      },
    );

    try {
      await job.updateProgress(10);

      // Fetch credential
      const credential: unknown = await this.credentialsService.findOne({
        _id: credentialId,
        isDeleted: false,
        organization: organizationId,
      });

      if (!credential) {
        this.logger.error(
          `Credential ${credentialId} not found for organization ${organizationId}`,
        );
        throw new Error(`Credential ${credentialId} not found`);
      }

      // Build credential data for Twitter API
      const credentialData = this.buildCredentialData(credential);

      await job.updateProgress(30);

      // Process all active bots for this organization
      const results =
        await this.replyBotOrchestratorService.processOrganizationBots(
          organizationId,
          credentialData,
        );

      await job.updateProgress(100);

      const summary: ReplyBotPollingResult = {
        botsProcessed: results.length,
        errors: results.reduce((sum, r) => sum + r.errors, 0),
        organizationId,
        totalDms: results.reduce((sum, r) => sum + r.dmsSent, 0),
        totalReplies: results.reduce((sum, r) => sum + r.repliesSent, 0),
      };

      this.logger.log(
        `Reply bot polling completed for organization ${organizationId}`,
        summary,
      );

      return summary;
    } catch (error: unknown) {
      this.logger.error(
        `Reply bot polling failed for organization ${organizationId}`,
        error,
      );
      throw error;
    }
  }
}
