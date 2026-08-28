import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { SocialInboxService } from '@server/collections/social-inbox/services/social-inbox.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';

const YOUTUBE_MESSAGES_SWEEP_INTERVAL_MS = 30 * 60 * 1000;

@Injectable()
export class CronYoutubeMessagesService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly socialInboxService: SocialInboxService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      SYSTEM_WORKFLOW_ACTION_IDS.YOUTUBE_COMMENTS_INGEST,
      async ({ context, input }) => {
        const credentialId = this.readRequiredString(
          input.credentialId,
          'credentialId',
        );
        const brandId = this.readRequiredString(input.brandId, 'brandId');
        return this.socialInboxService.ingestYoutubeComments(
          { brandId, organizationId: context.organizationId },
          { credentialId, limit: 25 },
        );
      },
    );
  }

  async syncYoutubeMessages(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const credentials = await this.prisma.credential.findMany({
        select: { brandId: true, id: true, organizationId: true },
        where: {
          brandId: { not: null },
          isConnected: true,
          isDeleted: false,
          organizationId: { not: null },
          platform: PrismaCredentialPlatform.YOUTUBE,
        },
      });

      let queued = 0;
      const sweepBucket = Math.floor(
        Date.now() / YOUTUBE_MESSAGES_SWEEP_INTERVAL_MS,
      );

      for (const credential of credentials) {
        if (!credential.organizationId || !credential.brandId) {
          continue;
        }

        try {
          await this.workflowQueue.queueSystemAction(
            {
              actionType: SYSTEM_WORKFLOW_ACTION_IDS.YOUTUBE_COMMENTS_INGEST,
              canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.YOUTUBE_COMMENTS_INGEST,
              inputValues: {
                brandId: credential.brandId,
                credentialId: credential.id,
              },
              organizationId: credential.organizationId,
              source: 'youtube_messages_sweep',
              trigger: WorkflowExecutionTrigger.SCHEDULED,
            },
            `${SYSTEM_WORKFLOW_ACTION_IDS.YOUTUBE_COMMENTS_INGEST}-${credential.id}-${sweepBucket}`,
          );
          queued += 1;
        } catch (error: unknown) {
          this.logger.warn(`${url} credential sync failed`, {
            credentialId: credential.id,
            error,
          });
        }
      }

      this.logger.log(`${url} completed`, {
        credentialCount: credentials.length,
        queued,
      });
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  private readRequiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`YouTube comment ingestion requires ${field}`);
    }
    return value;
  }
}
