import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import {
  buildSocialInboxSyncWorkflowDefinition,
  SOCIAL_INBOX_SYNC_ACTION_IDS,
  type SocialInboxSyncConversationType,
  type SocialInboxSyncInput,
  type SocialInboxSyncPlatform,
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
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';

const SOCIAL_INBOX_SYNC_SURFACES: ReadonlyArray<
  readonly [SocialInboxSyncPlatform, SocialInboxSyncConversationType]
> = [
  [Platform.YOUTUBE, SocialConversationType.COMMENT],
  [Platform.INSTAGRAM, SocialConversationType.COMMENT],
  [Platform.INSTAGRAM, SocialConversationType.DM],
  [Platform.TWITTER, SocialConversationType.COMMENT],
  [Platform.TWITTER, SocialConversationType.DM],
  [Platform.LINKEDIN, SocialConversationType.COMMENT],
  [Platform.LINKEDIN, SocialConversationType.DM],
];

/**
 * A sync that listed nothing because it could not run must fail the job, so a
 * completed job always means the inbox was actually read.
 */
function assertSyncDiagnosable(
  result: SocialInboxSyncResult,
  input: SocialInboxSyncInput,
): SocialInboxSyncResult {
  if (result.credentialsScanned === 0 && input.credentialId) {
    throw new Error(
      'Inbox sync found no connected account for the selected credential. Reconnect the account and sync again.',
    );
  }
  const failures = result.postFailures ?? [];
  if (
    failures.length > 0 &&
    failures.length === (result.postsScanned ?? failures.length)
  ) {
    throw new Error(
      `Inbox sync failed for all ${failures.length} scanned post(s): ${failures[0]?.errorName}: ${failures[0]?.message}`,
    );
  }
  return result;
}

@Injectable()
export class SocialInboxSyncWorkflowService implements OnModuleInit {
  constructor(
    private readonly socialInboxService: SocialInboxService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    @Optional()
    private readonly realtime?: SocialInboxRealtimeService,
  ) {}

  onModuleInit(): void {
    // The worker resolves a queued job by canonicalId, so every surface that
    // `enqueue` can address needs its own definition. An unregistered one fails
    // the job as "Unknown system workflow" before it ingests anything.
    for (const [platform, conversationType] of SOCIAL_INBOX_SYNC_SURFACES) {
      this.workflowRunner.registerWorkflow(
        buildSocialInboxSyncWorkflowDefinition(platform, conversationType),
      );
    }
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
      { dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
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

  private async ingestAction(
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
    const surface = {
      conversationType: (input.conversationType ??
        SocialConversationType.COMMENT) as 'comment' | 'dm',
      platform: String(input.platform ?? Platform.YOUTUBE),
    };
    try {
      const result = assertSyncDiagnosable(
        await executor(scope, options),
        input,
      );
      await this.realtime?.emitSyncResult(input.organizationId, {
        ...surface,
        commentsSeen: result.commentsSeen,
        conversationsCreated: result.conversationsCreated,
        kind: 'sync-completed',
        messagesCreated: result.messagesCreated,
        postFailureCount: result.postFailures?.length,
        postsScanned: result.postsScanned,
      });
      return result;
    } catch (error: unknown) {
      await this.realtime?.emitSyncResult(input.organizationId, {
        ...surface,
        kind: 'sync-failed',
        message: getErrorMessage(error).slice(0, 200),
      });
      throw error;
    }
  }

  private readInput(value: unknown): SocialInboxSyncInput {
    return (
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {}
    ) as SocialInboxSyncInput;
  }
}
