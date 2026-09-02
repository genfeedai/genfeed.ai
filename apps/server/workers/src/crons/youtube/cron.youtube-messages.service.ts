import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  buildYoutubeCommentsSweepDefinition,
  YOUTUBE_MAINTENANCE_ACTION_IDS,
} from '@workers/crons/youtube/youtube-maintenance-workflow-definition';

const YOUTUBE_MESSAGES_SWEEP_INTERVAL_MS = 30 * 60 * 1000;
const SYSTEM_MAINTENANCE_PRINCIPAL_ID = 'genfeed-public-tools';

@Injectable()
export class CronYoutubeMessagesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      YOUTUBE_MAINTENANCE_ACTION_IDS.DISCOVER_CREDENTIALS,
      async () => {
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
        return {
          items: credentials.flatMap((credential) =>
            credential.organizationId && credential.brandId
              ? [
                  {
                    brandId: credential.brandId,
                    credentialId: credential.id,
                    organizationId: credential.organizationId,
                  },
                ]
              : [],
          ),
        };
      },
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildYoutubeCommentsSweepDefinition(),
    );
  }

  async syncYoutubeMessages(): Promise<void> {
    const now = new Date();
    const definition = buildYoutubeCommentsSweepDefinition();
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: { requestedAt: now.toISOString() } },
        organizationId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
        source: 'youtube_messages_sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
      },
      `youtube-comments-sweep-${Math.floor(now.getTime() / YOUTUBE_MESSAGES_SWEEP_INTERVAL_MS)}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }
}
