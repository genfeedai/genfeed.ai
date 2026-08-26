import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { toReplyBotCredentialData } from '@api/services/campaign/reply-bot-credential.util';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import type { IReplyBotCredentialData } from '@genfeedai/interfaces';
import {
  REPLY_BOT_POLLING_QUEUE,
  ReplyBotPollingJobData,
  ReplyBotPollingResult,
} from '@genfeedai/queue-contracts';
import { SERVER_TOKENS, type ServerCredentialStore } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor(REPLY_BOT_POLLING_QUEUE)
export class ReplyBotPollingProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly replyBotOrchestratorService: ReplyBotOrchestratorService,
    readonly _replyBotConfigsService: ReplyBotConfigsService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
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
    if (!credential || typeof credential !== 'object') {
      throw new Error('Reply bot credential missing accessToken');
    }

    const shaped = toReplyBotCredentialData(
      credential as Record<string, unknown>,
    );
    if (!shaped) {
      throw new Error('Reply bot credential missing accessToken');
    }
    return shaped;
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
        id: credentialId,
        organizationId: organizationId,
      });

      if (!credential) {
        this.logger.error(
          `Credential ${credentialId} not found for organization ${organizationId}`,
        );
        throw new Error(`Credential ${credentialId} not found`);
      }

      // Decrypt once at the load boundary (any platform).
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
