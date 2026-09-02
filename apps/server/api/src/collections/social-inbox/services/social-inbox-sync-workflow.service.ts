import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import {
  buildSocialInboxSyncWorkflowDefinition,
  SOCIAL_INBOX_SYNC_ACTION_IDS,
  type SocialInboxSyncInput,
  type SocialInboxSyncResult,
} from '@api/collections/social-inbox/services/social-inbox-sync-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import {
  Platform,
  SocialConversationType,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';

@Injectable()
export class SocialInboxSyncWorkflowService implements OnModuleInit {
  constructor(
    private readonly socialInboxService: SocialInboxService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerWorkflow(
      buildSocialInboxSyncWorkflowDefinition(
        Platform.YOUTUBE,
        SocialConversationType.COMMENT,
      ),
    );
    this.workflowRunner.registerAction(
      SOCIAL_INBOX_SYNC_ACTION_IDS.VALIDATE,
      (request) => this.validateAction(request),
    );
    const actions = [
      [
        SOCIAL_INBOX_SYNC_ACTION_IDS.YOUTUBE_COMMENTS,
        this.socialInboxService.ingestYoutubeComments.bind(
          this.socialInboxService,
        ),
      ],
      [
        SOCIAL_INBOX_SYNC_ACTION_IDS.INSTAGRAM_COMMENTS,
        this.socialInboxService.ingestInstagramComments.bind(
          this.socialInboxService,
        ),
      ],
      [
        SOCIAL_INBOX_SYNC_ACTION_IDS.INSTAGRAM_DMS,
        this.socialInboxService.ingestInstagramDms.bind(
          this.socialInboxService,
        ),
      ],
      [
        SOCIAL_INBOX_SYNC_ACTION_IDS.X_COMMENTS,
        this.socialInboxService.ingestXComments.bind(this.socialInboxService),
      ],
      [
        SOCIAL_INBOX_SYNC_ACTION_IDS.X_DMS,
        this.socialInboxService.ingestXDms.bind(this.socialInboxService),
      ],
      [
        SOCIAL_INBOX_SYNC_ACTION_IDS.LINKEDIN_COMMENTS,
        this.socialInboxService.ingestLinkedInComments.bind(
          this.socialInboxService,
        ),
      ],
      [
        SOCIAL_INBOX_SYNC_ACTION_IDS.LINKEDIN_DMS,
        this.socialInboxService.ingestLinkedInDms.bind(this.socialInboxService),
      ],
    ] as const;
    for (const [actionId, executor] of actions) {
      this.workflowRunner.registerAction(actionId, (request) =>
        this.ingestAction(request, executor),
      );
    }
  }

  async enqueue(input: SocialInboxSyncInput): Promise<string> {
    const platform = input.platform ?? Platform.YOUTUBE;
    const conversationType =
      input.conversationType ?? SocialConversationType.COMMENT;
    const definition = buildSocialInboxSyncWorkflowDefinition(
      platform,
      conversationType,
    );
    return this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: input },
        organizationId: input.organizationId,
        source: 'social-inbox-sync-api',
        trigger: WorkflowExecutionTrigger.API,
        userId: input.userId,
      },
      `social-inbox-sync-${input.organizationId}-${input.platform ?? Platform.YOUTUBE}-${input.conversationType ?? SocialConversationType.COMMENT}-${input.credentialId ?? 'all'}-${Date.now()}`,
    );
  }

  private async validateAction(
    action: SystemWorkflowActionRequest,
  ): Promise<
    Required<
      Pick<
        SocialInboxSyncInput,
        'conversationType' | 'organizationId' | 'platform'
      >
    > &
      SocialInboxSyncInput
  > {
    const input = this.readInput(action.input.request);
    if (!input.organizationId) {
      throw new Error('Social inbox sync requires organizationId');
    }
    return {
      ...input,
      conversationType:
        input.conversationType ?? SocialConversationType.COMMENT,
      platform: input.platform ?? Platform.YOUTUBE,
    };
  }

  private ingestAction(
    action: SystemWorkflowActionRequest,
    executor: (
      scope: {
        brandId?: string;
        organizationId: string;
        userId?: string;
      },
      options: { credentialId?: string; limit?: number },
    ) => Promise<SocialInboxSyncResult>,
  ): Promise<SocialInboxSyncResult> {
    const input = this.readInput(action.input.state);
    const scope = {
      brandId: input.brandId,
      organizationId: input.organizationId,
      userId: input.userId,
    };
    const options = { credentialId: input.credentialId, limit: input.limit };
    return executor(scope, options);
  }

  private readInput(value: unknown): SocialInboxSyncInput {
    return (
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {}
    ) as SocialInboxSyncInput;
  }
}
