import type {
  SocialConversationAvailability,
  SocialConversationDocument,
  SocialMessage,
  SocialMessageDocument,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import {
  clamp,
  getAvailability,
  normalizePlatform,
  sanitizeBody,
} from '@api/collections/social-inbox/services/social-inbox.helpers';
import type {
  InboundSocialMessageInput,
  SocialInboxScope,
  XReplyTargetPost,
} from '@api/collections/social-inbox/services/social-inbox.types';
import type { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import { scopedWhere } from '@api/index';
import type { TwitterInboxTweet } from '@api/services/integrations/twitter/services/twitter-inbox.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  SocialConversationType,
  SocialMessageType,
} from '@genfeedai/contracts';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';

type ConnectedCredentialAccount = {
  externalHandle?: string | null;
  externalId?: string | null;
  externalName?: string | null;
  label?: string | null;
  userId?: string | null;
  username?: string | null;
};

export function accountFieldsFromCredential(
  credential: ConnectedCredentialAccount,
  fallbackUserId?: string,
) {
  return {
    accountExternalId: credential.externalId ?? undefined,
    accountHandle:
      credential.externalHandle ?? credential.username ?? undefined,
    accountName: credential.externalName ?? credential.label ?? undefined,
    userId: credential.userId ?? fallbackUserId,
  };
}

export type SyncedItem = {
  input: InboundSocialMessageInput;
  messageId: string;
  threadId: string;
};

export function toXPostReplyItem(
  credential: Parameters<typeof accountFieldsFromCredential>[0] & {
    id: string;
  },
  scope: SocialInboxScope,
  post: XReplyTargetPost,
  reply: TwitterInboxTweet,
): SyncedItem {
  return {
    input: {
      ...accountFieldsFromCredential(credential, scope.userId),
      body: reply.text,
      brandId: post.brandId,
      conversationType: SocialConversationType.COMMENT,
      createdAt: reply.createdAt,
      credentialId: credential.id,
      externalConversationId: reply.conversationId,
      externalMessageId: reply.tweetId,
      externalParentId: reply.tweetId,
      externalParentMessageId: reply.inReplyToId ?? undefined,
      externalThreadId: reply.conversationId,
      organizationId: scope.organizationId,
      participantAvatarUrl: reply.authorAvatarUrl,
      participantExternalId: reply.authorId,
      participantHandle: reply.authorUsername,
      participantName: reply.authorName ?? reply.authorUsername,
      platform: Platform.TWITTER,
      postId: post.id,
      sourceContentId: String(post.externalId),
      sourceContentTitle: post.label ?? post.description.slice(0, 120),
      sourceContentType: 'tweet',
      sourceContentUrl: post.url ?? `https://x.com/i/status/${post.externalId}`,
    },
    messageId: reply.tweetId,
    threadId: reply.conversationId,
  };
}

export type InboundMessageIngestPorts = {
  prisma: {
    socialConversation: Pick<
      PrismaService['socialConversation'],
      'findFirst' | 'create' | 'updateMany'
    >;
    socialMessage: Pick<PrismaService['socialMessage'], 'findFirst' | 'create'>;
  };
  realtime: Pick<SocialInboxRealtimeService, 'emit'>;
  hasWorkflowQueue: () => boolean;
  queueCommentTrigger: (
    input: InboundSocialMessageInput,
    message: SocialMessage,
    conversation: SocialConversationDocument,
  ) => Promise<void>;
};

export async function ingestInboundSocialMessage(
  input: InboundSocialMessageInput,
  ports: InboundMessageIngestPorts,
): Promise<SocialMessageDocument> {
  const platform = normalizePlatform(input.platform);
  const body = sanitizeBody(input.body);
  const messageCreatedAt = input.createdAt ?? new Date();
  const availability = getAvailability({
    conversationType: input.conversationType,
    externalParentId: input.externalParentId,
    participantExternalId: input.participantExternalId,
    platform,
    sourceContentId: input.sourceContentId,
  });

  const conversation = await findOrCreateConversation(
    {
      ...input,
      availability,
      body,
      createdAt: messageCreatedAt,
      platform,
    },
    ports.prisma,
  );

  const existing = await ports.prisma.socialMessage.findFirst({
    where: scopedWhere(input.organizationId, {
      externalMessageId: input.externalMessageId,
      platform,
    }),
  });

  if (existing) {
    await ports.queueCommentTrigger(input, existing, conversation);
    return existing;
  }

  let message: Awaited<ReturnType<typeof ports.prisma.socialMessage.create>>;
  try {
    message = await ports.prisma.socialMessage.create({
      data: {
        body,
        brandId: input.brandId,
        conversationId: conversation.id,
        createdAt: messageCreatedAt,
        credentialId: input.credentialId,
        direction: 'inbound',
        externalMessageId: input.externalMessageId,
        externalParentMessageId: input.externalParentMessageId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        messageType:
          input.conversationType === SocialConversationType.DM
            ? SocialMessageType.DM
            : SocialMessageType.COMMENT,
        organizationId: input.organizationId,
        platform,
        postId: input.postId,
        senderAvatarUrl: clamp(input.participantAvatarUrl, 2048),
        senderExternalId: clamp(input.participantExternalId, 512),
        senderHandle: clamp(input.participantHandle, 280),
        senderName: clamp(input.participantName, 280),
        sourceUrl: clamp(input.sourceContentUrl, 2048),
        status: 'received',
        userId: input.userId,
        workflowTriggerStatus:
          ports.hasWorkflowQueue() && input.userId ? 'pending' : undefined,
      },
    });
  } catch (error) {
    // Same ingestion race as conversations: unique
    // (organizationId, platform, externalMessageId) makes the losing
    // concurrent create throw P2002 — return the winner's row.
    if ((error as { code?: string })?.code !== 'P2002') {
      throw error;
    }
    const winner = await ports.prisma.socialMessage.findFirst({
      where: scopedWhere(input.organizationId, {
        externalMessageId: input.externalMessageId,
        platform,
      }),
    });
    if (!winner) {
      throw error;
    }
    await ports.queueCommentTrigger(input, winner, conversation);
    return winner;
  }

  // Batches are reverse-chronological: only the newest message advances the
  // preview; unreadCount and inboundSequence (read cursor) always increment.
  const previewAdvanced = await ports.prisma.socialConversation.updateMany({
    data: {
      inboundSequence: { increment: 1 },
      latestMessageAt: messageCreatedAt,
      latestMessageText: clamp(body, 500),
      lastInboundAt: messageCreatedAt,
      unreadCount: { increment: 1 },
      updatedAt: new Date(),
    },
    where: scopedWhere(input.organizationId, {
      id: conversation.id,
      OR: [
        { latestMessageAt: null },
        { latestMessageAt: { lte: messageCreatedAt } },
      ],
    }),
  });

  if (previewAdvanced.count === 0) {
    await ports.prisma.socialConversation.updateMany({
      data: {
        inboundSequence: { increment: 1 },
        unreadCount: { increment: 1 },
        updatedAt: new Date(),
      },
      where: scopedWhere(input.organizationId, { id: conversation.id }),
    });
  }

  // A new reply reopens an archived thread (common inbox behavior), which
  // keeps unreadCount > 0 and status === 'archived' mutually exclusive —
  // the invariant unreadFilter() and the bell's checks rely on.
  await ports.prisma.socialConversation.updateMany({
    data: { status: 'open', updatedAt: new Date() },
    where: scopedWhere(input.organizationId, {
      id: conversation.id,
      status: 'archived',
    }),
  });

  await ports.queueCommentTrigger(input, message, conversation);

  await ports.realtime.emit(
    input.organizationId,
    conversation.id,
    'message-created',
  );

  return message;
}

async function findOrCreateConversation(
  input: InboundSocialMessageInput & {
    availability: SocialConversationAvailability;
    body: string;
    createdAt: Date;
    platform: string;
  },
  prisma: InboundMessageIngestPorts['prisma'],
): Promise<SocialConversationDocument> {
  const existing = await prisma.socialConversation.findFirst({
    where: scopedWhere(input.organizationId, {
      externalConversationId: input.externalConversationId,
      platform: input.platform,
    }),
  });

  if (existing) {
    return existing;
  }

  let created: Awaited<ReturnType<typeof prisma.socialConversation.create>>;
  try {
    created = await prisma.socialConversation.create({
      data: {
        accountExternalId: clamp(input.accountExternalId, 512),
        accountHandle: clamp(input.accountHandle, 280),
        accountName: clamp(input.accountName, 280),
        availability: toPrismaJson(input.availability),
        automationState: 'manual',
        brandId: input.brandId,
        conversationType: input.conversationType,
        credentialId: input.credentialId,
        externalConversationId: input.externalConversationId,
        externalParentId: clamp(input.externalParentId, 512),
        externalThreadId: clamp(input.externalThreadId, 512),
        lastInboundAt: input.createdAt,
        latestMessageAt: input.createdAt,
        latestMessageText: clamp(input.body, 500),
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        organizationId: input.organizationId,
        participantAvatarUrl: clamp(input.participantAvatarUrl, 2048),
        participantExternalId: clamp(input.participantExternalId, 512),
        participantHandle: clamp(input.participantHandle, 280),
        participantName: clamp(input.participantName, 280),
        platform: input.platform,
        postId: input.postId,
        sourceContentId: clamp(input.sourceContentId, 512),
        sourceContentTitle: clamp(input.sourceContentTitle, 500),
        sourceContentType: clamp(input.sourceContentType, 100),
        sourceContentUrl: clamp(input.sourceContentUrl, 2048),
        status: 'open',
        unreadCount: 0,
        userId: input.userId,
      },
    });
  } catch (error) {
    // Concurrent ingestion (webhook + cron) can race the findFirst above;
    // the unique (organizationId, platform, externalConversationId) makes
    // the loser throw P2002 — recover by returning the winner's row.
    if ((error as { code?: string })?.code !== 'P2002') {
      throw error;
    }
    const winner = await prisma.socialConversation.findFirst({
      where: scopedWhere(input.organizationId, {
        externalConversationId: input.externalConversationId,
        platform: input.platform,
      }),
    });
    if (!winner) {
      throw error;
    }
    return winner;
  }

  return created;
}
