import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { BadRequestException } from '@nestjs/common';

type StoreConversation = {
  id: string;
  mongoId: string | null;
  organizationId: string;
  userId: string | null;
  brandId: string | null;
  credentialId: string | null;
  postId: string | null;
  platform: string;
  conversationType: string;
  externalConversationId: string | null;
  externalThreadId: string | null;
  externalParentId: string | null;
  sourceContentId: string | null;
  sourceContentUrl: string | null;
  sourceContentTitle: string | null;
  sourceContentType: string | null;
  accountExternalId: string | null;
  accountHandle: string | null;
  accountName: string | null;
  participantExternalId: string | null;
  participantHandle: string | null;
  participantName: string | null;
  participantAvatarUrl: string | null;
  status: string;
  priority: string;
  unreadCount: number;
  needsReview: boolean;
  automationState: string;
  assignedOwnerId: string | null;
  tags: string[];
  latestMessageText: string | null;
  latestMessageAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  availability: Record<string, unknown>;
  metadata: Record<string, unknown>;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type StoreMessage = {
  id: string;
  mongoId: string | null;
  conversationId: string;
  organizationId: string;
  userId: string | null;
  brandId: string | null;
  credentialId: string | null;
  postId: string | null;
  platform: string;
  direction: string;
  messageType: string;
  body: string;
  externalMessageId: string | null;
  externalParentMessageId: string | null;
  senderExternalId: string | null;
  senderHandle: string | null;
  senderName: string | null;
  senderAvatarUrl: string | null;
  authorRole: string | null;
  status: string;
  sourceUrl: string | null;
  idempotencyKey: string | null;
  workflowRunId: string | null;
  agentRunId: string | null;
  actionProvenance: Record<string, unknown>;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type TestContext = {
  conversations: StoreConversation[];
  messages: StoreMessage[];
  instagramService: {
    replyToComment: ReturnType<typeof vi.fn>;
    sendCommentReplyDm: ReturnType<typeof vi.fn>;
  };
  queueService: {
    queueTriggerEvent: ReturnType<typeof vi.fn>;
  };
  service: SocialInboxService;
  youtubeService: {
    listVideoComments: ReturnType<typeof vi.fn>;
    postCommentReply: ReturnType<typeof vi.fn>;
  };
};

function matchesWhere<T extends Record<string, unknown>>(
  item: T,
  where: Record<string, unknown> = {},
): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) {
      return true;
    }

    if (key === 'OR' && Array.isArray(value)) {
      return value.some((clause) =>
        matchesWhere(item, clause as Record<string, unknown>),
      );
    }

    if (key === 'AND' && Array.isArray(value)) {
      return value.every((clause) =>
        matchesWhere(item, clause as Record<string, unknown>),
      );
    }

    if (typeof value === 'object' && value !== null) {
      const operator = value as Record<string, unknown>;
      if ('not' in operator) {
        return item[key] !== operator.not;
      }
      if ('gt' in operator) {
        return Number(item[key]) > Number(operator.gt);
      }
      if ('in' in operator && Array.isArray(operator.in)) {
        return operator.in.includes(item[key]);
      }
      if ('has' in operator && Array.isArray(item[key])) {
        return (item[key] as unknown[]).includes(operator.has);
      }
      if ('contains' in operator && typeof item[key] === 'string') {
        return (item[key] as string)
          .toLowerCase()
          .includes(String(operator.contains).toLowerCase());
      }
    }

    return item[key] === value;
  });
}

function createContext(): TestContext {
  const conversations: StoreConversation[] = [];
  const messages: StoreMessage[] = [];
  let conversationCounter = 0;
  let messageCounter = 0;

  const prisma = {
    credential: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    post: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    socialConversation: {
      count: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            conversations.filter((item) => matchesWhere(item, where)).length,
          ),
        ),
      create: vi.fn().mockImplementation(({ data }) => {
        const now = new Date();
        const conversation: StoreConversation = {
          accountExternalId: data.accountExternalId ?? null,
          accountHandle: data.accountHandle ?? null,
          accountName: data.accountName ?? null,
          assignedOwnerId: data.assignedOwnerId ?? null,
          automationState: data.automationState ?? 'manual',
          availability: data.availability ?? {},
          brandId: data.brandId ?? null,
          conversationType: data.conversationType ?? 'comment',
          createdAt: data.createdAt ?? now,
          credentialId: data.credentialId ?? null,
          externalConversationId: data.externalConversationId ?? null,
          externalParentId: data.externalParentId ?? null,
          externalThreadId: data.externalThreadId ?? null,
          id: `conversation-${++conversationCounter}`,
          isDeleted: false,
          lastInboundAt: data.lastInboundAt ?? null,
          lastOutboundAt: data.lastOutboundAt ?? null,
          latestMessageAt: data.latestMessageAt ?? null,
          latestMessageText: data.latestMessageText ?? null,
          metadata: data.metadata ?? {},
          mongoId: null,
          needsReview: data.needsReview ?? false,
          organizationId: data.organizationId,
          participantAvatarUrl: data.participantAvatarUrl ?? null,
          participantExternalId: data.participantExternalId ?? null,
          participantHandle: data.participantHandle ?? null,
          participantName: data.participantName ?? null,
          platform: data.platform,
          postId: data.postId ?? null,
          priority: data.priority ?? 'normal',
          sourceContentId: data.sourceContentId ?? null,
          sourceContentTitle: data.sourceContentTitle ?? null,
          sourceContentType: data.sourceContentType ?? null,
          sourceContentUrl: data.sourceContentUrl ?? null,
          status: data.status ?? 'open',
          tags: data.tags ?? [],
          unreadCount: data.unreadCount ?? 0,
          updatedAt: data.updatedAt ?? now,
          userId: data.userId ?? null,
        };
        conversations.push(conversation);
        return Promise.resolve(conversation);
      }),
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            conversations.find((item) => matchesWhere(item, where)) ?? null,
          ),
        ),
      findMany: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            conversations.filter((item) => matchesWhere(item, where)),
          ),
        ),
      update: vi.fn().mockImplementation(({ data, where }) => {
        const conversation = conversations.find((item) => item.id === where.id);
        if (!conversation) {
          throw new Error('conversation not found');
        }
        Object.assign(conversation, {
          ...data,
          unreadCount:
            typeof data.unreadCount === 'object' && data.unreadCount?.increment
              ? conversation.unreadCount + data.unreadCount.increment
              : (data.unreadCount ?? conversation.unreadCount),
        });
        return Promise.resolve(conversation);
      }),
    },
    socialMessage: {
      count: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            messages.filter((item) => matchesWhere(item, where)).length,
          ),
        ),
      create: vi.fn().mockImplementation(({ data }) => {
        const now = new Date();
        const message: StoreMessage = {
          actionProvenance: data.actionProvenance ?? {},
          agentRunId: data.agentRunId ?? null,
          authorRole: data.authorRole ?? null,
          body: data.body,
          brandId: data.brandId ?? null,
          conversationId: data.conversationId,
          createdAt: data.createdAt ?? now,
          credentialId: data.credentialId ?? null,
          direction: data.direction,
          externalMessageId: data.externalMessageId ?? null,
          externalParentMessageId: data.externalParentMessageId ?? null,
          failureReason: data.failureReason ?? null,
          id: `message-${++messageCounter}`,
          idempotencyKey: data.idempotencyKey ?? null,
          isDeleted: false,
          messageType: data.messageType ?? 'comment',
          metadata: data.metadata ?? {},
          mongoId: null,
          organizationId: data.organizationId,
          platform: data.platform,
          postId: data.postId ?? null,
          senderAvatarUrl: data.senderAvatarUrl ?? null,
          senderExternalId: data.senderExternalId ?? null,
          senderHandle: data.senderHandle ?? null,
          senderName: data.senderName ?? null,
          sourceUrl: data.sourceUrl ?? null,
          status: data.status ?? 'received',
          updatedAt: data.updatedAt ?? now,
          userId: data.userId ?? null,
          workflowRunId: data.workflowRunId ?? null,
        };
        messages.push(message);
        return Promise.resolve(message);
      }),
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            messages.find((item) => matchesWhere(item, where)) ?? null,
          ),
        ),
      findMany: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(messages.filter((item) => matchesWhere(item, where))),
        ),
      update: vi.fn().mockImplementation(({ data, where }) => {
        const message = messages.find((item) => item.id === where.id);
        if (!message) {
          throw new Error('message not found');
        }
        Object.assign(message, data);
        return Promise.resolve(message);
      }),
    },
  };

  const youtubeService = {
    listVideoComments: vi.fn(),
    postCommentReply: vi.fn().mockResolvedValue({ commentId: 'reply-1' }),
  };
  const instagramService = {
    replyToComment: vi.fn().mockResolvedValue({ commentId: 'ig-reply-1' }),
    sendCommentReplyDm: vi.fn().mockResolvedValue('dm-1'),
  };
  const queueService = {
    queueTriggerEvent: vi.fn().mockResolvedValue('workflow-job-1'),
  };

  return {
    conversations,
    instagramService,
    messages,
    queueService,
    service: new SocialInboxService(
      prisma as never,
      youtubeService as never,
      instagramService as never,
      queueService as never,
    ),
    youtubeService,
  };
}

describe('SocialInboxService', () => {
  it('ingests inbound YouTube comments into a durable conversation', async () => {
    const { conversations, messages, service } = createContext();

    const message = await service.ingestInboundMessage({
      body: '<p>Hello <strong>team</strong></p>',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      externalParentId: 'comment-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      participantName: 'Taylor',
      platform: 'youtube',
      sourceContentId: 'video-1',
    });

    expect(message.body).toBe('Hello team');
    expect(message._id).toBe(message.id);
    expect(messages).toHaveLength(1);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].latestMessageText).toBe('Hello team');
    expect(conversations[0].unreadCount).toBe(1);
    expect(conversations[0].availability).toMatchObject({
      canPostReply: true,
      canSendDm: false,
    });
  });

  it('posts replies idempotently through the connected YouTube account', async () => {
    const { messages, service, youtubeService } = createContext();
    const inbound = await service.ingestInboundMessage({
      body: 'Inbound',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      externalParentId: 'comment-1',
      organizationId: 'org-1',
      platform: 'youtube',
      sourceContentUrl: 'https://youtube.com/watch?v=video-1',
    });

    const first = await service.postReply(
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      inbound.conversationId,
      {
        idempotencyKey: 'same-action',
        text: 'Thanks for the comment',
        workflowRunId: 'workflow-run-1',
      },
    );
    const second = await service.postReply(
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      inbound.conversationId,
      {
        idempotencyKey: 'same-action',
        text: 'Thanks for the comment',
        workflowRunId: 'workflow-run-1',
      },
    );

    expect(first.id).toBe(second.id);
    expect(
      messages.filter((message) => message.direction === 'outbound'),
    ).toHaveLength(1);
    expect(youtubeService.postCommentReply).toHaveBeenCalledTimes(1);
    expect(first.workflowRunId).toBe('workflow-run-1');
    expect(first.status).toBe('sent');
  });

  it('queues comment trigger workflows when the inbound message has a user owner', async () => {
    const { conversations, queueService, service } = createContext();

    const message = await service.ingestInboundMessage({
      body: 'Need help with pricing',
      brandId: 'brand-1',
      conversationType: 'comment',
      credentialId: 'credential-1',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      externalParentId: 'comment-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      participantHandle: '@taylor',
      platform: 'youtube',
      sourceContentId: 'video-1',
      sourceContentUrl: 'https://youtube.com/watch?v=video-1',
      userId: 'user-1',
    });

    expect(queueService.queueTriggerEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        authorId: 'author-1',
        authorUsername: '@taylor',
        brandId: 'brand-1',
        conversationId: message.conversationId,
        credentialId: 'credential-1',
        messageId: message.id,
        platform: 'youtube',
        postId: 'comment-1',
        text: 'Need help with pricing',
      }),
      organizationId: 'org-1',
      platform: 'youtube',
      type: 'commentTrigger',
      userId: 'user-1',
    });
    expect(conversations[0].metadata).toMatchObject({
      lastWorkflowTriggerJobId: 'workflow-job-1',
    });
  });

  it('approves a draft by publishing once and marking the draft approved', async () => {
    const { messages, service, youtubeService } = createContext();
    const inbound = await service.ingestInboundMessage({
      body: 'Inbound',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      externalParentId: 'comment-1',
      organizationId: 'org-1',
      platform: 'youtube',
      sourceContentUrl: 'https://youtube.com/watch?v=video-1',
    });
    const scope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };

    const draft = await service.createDraft(scope, inbound.conversationId, {
      text: 'Drafted answer',
      workflowRunId: 'workflow-run-1',
    });
    const sent = await service.approveDraft(
      scope,
      inbound.conversationId,
      draft.id,
    );

    expect(youtubeService.postCommentReply).toHaveBeenCalledTimes(1);
    expect(sent.status).toBe('sent');
    expect(sent.workflowRunId).toBe('workflow-run-1');
    expect(messages.find((message) => message.id === draft.id)).toMatchObject({
      actionProvenance: expect.objectContaining({
        approvedBy: 'user-1',
        approvedMessageId: sent.id,
      }),
      status: 'approved',
    });
  });

  it('prevents another tenant from reading or acting on a conversation', async () => {
    const { service, youtubeService } = createContext();
    const inbound = await service.ingestInboundMessage({
      body: 'Tenant scoped inbound',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      externalParentId: 'comment-1',
      organizationId: 'org-1',
      platform: 'youtube',
      sourceContentUrl: 'https://youtube.com/watch?v=video-1',
    });
    const wrongTenantScope = {
      brandId: 'brand-1',
      organizationId: 'org-2',
      userId: 'user-2',
    };

    await expect(
      service.getConversation(wrongTenantScope, inbound.conversationId),
    ).rejects.toThrow('Social conversation not found');
    await expect(
      service.postReply(wrongTenantScope, inbound.conversationId, {
        text: 'Cross-tenant reply',
      }),
    ).rejects.toThrow('Social conversation not found');
    expect(youtubeService.postCommentReply).not.toHaveBeenCalled();
  });

  it('blocks YouTube DMs with a provider-specific reason', async () => {
    const { service } = createContext();
    const inbound = await service.ingestInboundMessage({
      body: 'Inbound',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      externalParentId: 'comment-1',
      organizationId: 'org-1',
      platform: 'youtube',
    });

    await expect(
      service.sendDm(
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        inbound.conversationId,
        { text: 'Follow up' },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
