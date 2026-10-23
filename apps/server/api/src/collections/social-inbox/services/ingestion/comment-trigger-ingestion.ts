import type {
  SocialConversationDocument,
  SocialMessage,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import type { InboundSocialMessageInput } from '@api/collections/social-inbox/services/social-inbox.types';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { readRecord } from '@genfeedai/utils/data/extract.util';

const WORKFLOW_TRIGGER_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

type WorkflowTriggerClaim = {
  attemptedAt: Date;
  jobId: string;
};
type TriggerMessage = Pick<SocialMessage, 'id' | 'userId' | 'body'>;
type TriggerConversation = Pick<SocialConversationDocument, 'id' | 'platform'>;
type TriggerTransaction = {
  socialConversation: Pick<
    PrismaService['socialConversation'],
    'findFirst' | 'updateMany'
  >;
  socialMessage: Pick<PrismaService['socialMessage'], 'updateMany'>;
};
export type CommentTriggerIngestPorts = {
  prisma: Pick<TriggerTransaction, 'socialMessage'> & {
    $transaction: (
      write: (transaction: TriggerTransaction) => Promise<void>,
    ) => Promise<void>;
  };
  queueService?: Pick<WorkflowExecutionQueueService, 'queueTriggerEvent'>;
};

export async function queueSocialCommentTrigger(
  input: InboundSocialMessageInput,
  message: TriggerMessage,
  conversation: TriggerConversation,
  ports: CommentTriggerIngestPorts,
): Promise<void> {
  const userId = input.userId ?? message.userId ?? undefined;
  const { prisma, queueService } = ports;
  if (!queueService || !userId) {
    return;
  }

  const claim = await claimCommentTrigger(input, message, conversation, prisma);
  if (!claim) {
    return;
  }

  let queuedJobId: string;
  try {
    queuedJobId = await enqueueCommentTrigger(
      input,
      message,
      conversation,
      userId,
      claim.jobId,
      queueService,
    );
  } catch (error: unknown) {
    await finalizeFailedCommentTrigger(
      input,
      message,
      conversation,
      claim.attemptedAt,
      error instanceof Error ? error.message : String(error),
      prisma,
    );
    return;
  }

  await finalizeQueuedCommentTrigger(
    input,
    message,
    conversation,
    claim.attemptedAt,
    queuedJobId,
    prisma,
  );
}

async function claimCommentTrigger(
  input: InboundSocialMessageInput,
  message: TriggerMessage,
  conversation: TriggerConversation,
  prisma: CommentTriggerIngestPorts['prisma'],
): Promise<WorkflowTriggerClaim | null> {
  const attemptedAt = new Date();
  const staleClaimBefore = new Date(
    attemptedAt.getTime() - WORKFLOW_TRIGGER_CLAIM_TIMEOUT_MS,
  );
  const jobId = [
    'social-comment-trigger',
    input.organizationId,
    message.id,
  ].join('-');
  const claim = await prisma.socialMessage.updateMany({
    data: {
      workflowTriggerAttemptedAt: attemptedAt,
      workflowTriggerError: null,
      workflowTriggerJobId: jobId,
      workflowTriggerStatus: 'enqueueing',
    },
    where: scopedWhere(input.organizationId, {
      conversationId: conversation.id,
      id: message.id,
      OR: [
        { workflowTriggerStatus: null },
        { workflowTriggerStatus: { in: ['pending', 'failed'] } },
        {
          workflowTriggerAttemptedAt: { lt: staleClaimBefore },
          workflowTriggerStatus: 'enqueueing',
        },
      ],
    }),
  });

  return claim.count === 0 ? null : { attemptedAt, jobId };
}

function enqueueCommentTrigger(
  input: InboundSocialMessageInput,
  message: TriggerMessage,
  conversation: TriggerConversation,
  userId: string,
  jobId: string,
  queueService: NonNullable<CommentTriggerIngestPorts['queueService']>,
): Promise<string> {
  return queueService.queueTriggerEvent(
    {
      data: {
        authorId: input.participantExternalId,
        authorUsername: input.participantHandle ?? input.participantName,
        brandId: input.brandId,
        commentId: input.externalMessageId,
        contentId: input.sourceContentId,
        contentUrl: input.sourceContentUrl,
        conversationId: conversation.id,
        credentialId: input.credentialId,
        externalMessageId: input.externalMessageId,
        externalParentId: input.externalParentId,
        messageId: message.id,
        parentId: input.externalParentId,
        platform: conversation.platform,
        postId:
          input.externalParentId ??
          input.externalMessageId ??
          input.sourceContentId,
        postUrl: input.sourceContentUrl,
        sourceContentId: input.sourceContentId,
        text: message.body,
      },
      organizationId: input.organizationId,
      platform: conversation.platform,
      type: 'commentTrigger',
      userId,
    },
    { jobId },
  );
}

async function finalizeFailedCommentTrigger(
  input: InboundSocialMessageInput,
  message: TriggerMessage,
  conversation: TriggerConversation,
  attemptedAt: Date,
  errorMessage: string,
  prisma: CommentTriggerIngestPorts['prisma'],
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const finalized = await transaction.socialMessage.updateMany({
      data: {
        workflowTriggerError: errorMessage,
        workflowTriggerStatus: 'failed',
      },
      where: scopedWhere(input.organizationId, {
        conversationId: conversation.id,
        id: message.id,
        workflowTriggerAttemptedAt: attemptedAt,
        workflowTriggerStatus: 'enqueueing',
      }),
    });
    if (finalized.count === 0) {
      return;
    }

    const freshConversation = await transaction.socialConversation.findFirst({
      where: scopedWhere(input.organizationId, { id: conversation.id }),
    });
    if (!freshConversation) {
      return;
    }

    await transaction.socialConversation.updateMany({
      data: {
        automationState: 'failed',
        metadata: {
          ...readRecord(freshConversation.metadata),
          workflowTriggerError: errorMessage,
          workflowTriggerFailedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
      where: scopedWhere(input.organizationId, { id: conversation.id }),
    });
  });
}

async function finalizeQueuedCommentTrigger(
  input: InboundSocialMessageInput,
  message: TriggerMessage,
  conversation: TriggerConversation,
  attemptedAt: Date,
  queuedJobId: string,
  prisma: CommentTriggerIngestPorts['prisma'],
): Promise<void> {
  const queuedAt = new Date();
  await prisma.$transaction(async (transaction) => {
    const finalized = await transaction.socialMessage.updateMany({
      data: {
        workflowTriggerError: null,
        workflowTriggerJobId: queuedJobId,
        workflowTriggerQueuedAt: queuedAt,
        workflowTriggerStatus: 'queued',
      },
      where: scopedWhere(input.organizationId, {
        conversationId: conversation.id,
        id: message.id,
        workflowTriggerAttemptedAt: attemptedAt,
        workflowTriggerStatus: 'enqueueing',
      }),
    });
    if (finalized.count === 0) {
      return;
    }

    const freshConversation = await transaction.socialConversation.findFirst({
      where: scopedWhere(input.organizationId, { id: conversation.id }),
    });
    if (!freshConversation) {
      return;
    }
    const freshMetadata = readRecord(freshConversation.metadata);

    await transaction.socialConversation.updateMany({
      data: {
        automationState:
          freshConversation.automationState === 'failed' &&
          typeof freshMetadata.workflowTriggerFailedAt === 'string'
            ? 'manual'
            : freshConversation.automationState,
        metadata: {
          ...freshMetadata,
          lastWorkflowTriggerJobId: queuedJobId,
          lastWorkflowTriggeredAt: queuedAt.toISOString(),
          workflowTriggerError: null,
          workflowTriggerFailedAt: null,
        } as Prisma.InputJsonValue,
      },
      where: scopedWhere(input.organizationId, { id: conversation.id }),
    });
  });
}
