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
  workflowTriggerStatus: string | null;
  workflowTriggerJobId: string | null;
  workflowTriggerError: string | null;
  workflowTriggerAttemptedAt: Date | null;
  workflowTriggerQueuedAt: Date | null;
  actionProvenance: Record<string, unknown>;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaMock = {
  $transaction: ReturnType<typeof vi.fn>;
  credential: { findMany: ReturnType<typeof vi.fn> };
  post: { findMany: ReturnType<typeof vi.fn> };
  socialConversation: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  socialMessage: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

type TestContext = {
  conversations: StoreConversation[];
  messages: StoreMessage[];
  instagramService: {
    replyToComment: ReturnType<typeof vi.fn>;
    sendCommentReplyDm: ReturnType<typeof vi.fn>;
  };
  prisma: PrismaMock;
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
      if ('lt' in operator) {
        return Number(item[key]) < Number(operator.lt);
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
    $transaction: vi.fn(),
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
          workflowTriggerAttemptedAt: data.workflowTriggerAttemptedAt ?? null,
          workflowTriggerError: data.workflowTriggerError ?? null,
          workflowTriggerJobId: data.workflowTriggerJobId ?? null,
          workflowTriggerQueuedAt: data.workflowTriggerQueuedAt ?? null,
          workflowTriggerStatus: data.workflowTriggerStatus ?? null,
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
      updateMany: vi.fn().mockImplementation(({ data, where }) => {
        const matches = messages.filter((item) => matchesWhere(item, where));
        for (const message of matches) {
          Object.assign(message, data);
        }
        return Promise.resolve({ count: matches.length });
      }),
    },
  };
  prisma.$transaction.mockImplementation(
    (transaction: (client: PrismaMock) => Promise<unknown>) =>
      transaction(prisma as unknown as PrismaMock),
  );

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
    prisma: prisma as unknown as PrismaMock,
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
    expect(message.id).toBe(message.id);
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
    expect(first.actionProvenance).toMatchObject({
      action: 'post_reply',
      actedAt: expect.any(String),
      actorType: 'workflow',
      platform: 'youtube',
      status: 'sent',
      userId: 'user-1',
      workflowRunId: 'workflow-run-1',
    });
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

    expect(queueService.queueTriggerEvent).toHaveBeenCalledWith(
      {
        data: expect.objectContaining({
          authorId: 'author-1',
          authorUsername: '@taylor',
          brandId: 'brand-1',
          commentId: 'comment-1',
          conversationId: message.conversationId,
          contentId: 'video-1',
          contentUrl: 'https://youtube.com/watch?v=video-1',
          credentialId: 'credential-1',
          messageId: message.id,
          parentId: 'comment-1',
          platform: 'youtube',
          postId: 'comment-1',
          text: 'Need help with pricing',
        }),
        organizationId: 'org-1',
        platform: 'youtube',
        type: 'commentTrigger',
        userId: 'user-1',
      },
      {
        jobId: `social-comment-trigger-org-1-${message.id}`,
      },
    );
    expect(conversations[0].metadata).toMatchObject({
      lastWorkflowTriggerJobId: 'workflow-job-1',
    });
  });

  it('repairs a failed comment trigger once across concurrent re-ingestion', async () => {
    const { conversations, messages, prisma, queueService, service } =
      createContext();
    const input = {
      body: 'Need help with pricing',
      brandId: 'brand-1',
      conversationType: 'comment',
      credentialId: 'credential-1',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      externalParentId: 'comment-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      platform: 'youtube',
      sourceContentId: 'video-1',
      userId: 'user-1',
    };
    queueService.queueTriggerEvent
      .mockRejectedValueOnce(new Error('redis unavailable'))
      .mockResolvedValue('workflow-job-retry');

    const inbound = await service.ingestInboundMessage(input);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      workflowTriggerError: 'redis unavailable',
      workflowTriggerStatus: 'failed',
    });
    expect(conversations[0].automationState).toBe('failed');

    const [firstRetry, secondRetry] = await Promise.all([
      service.ingestInboundMessage(input),
      service.ingestInboundMessage(input),
    ]);

    expect(firstRetry.id).toBe(inbound.id);
    expect(secondRetry.id).toBe(inbound.id);
    expect(messages).toHaveLength(1);
    expect(queueService.queueTriggerEvent).toHaveBeenCalledTimes(2);
    expect(queueService.queueTriggerEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        type: 'commentTrigger',
        userId: 'user-1',
      }),
      {
        jobId: `social-comment-trigger-org-1-${inbound.id}`,
      },
    );
    expect(messages[0]).toMatchObject({
      workflowTriggerError: null,
      workflowTriggerJobId: 'workflow-job-retry',
      workflowTriggerQueuedAt: expect.any(Date),
      workflowTriggerStatus: 'queued',
    });
    for (const call of prisma.socialMessage.updateMany.mock.calls) {
      expect(call[0].where).toMatchObject({
        conversationId: inbound.conversationId,
        id: inbound.id,
        isDeleted: false,
        organizationId: 'org-1',
      });
    }
    expect(conversations[0]).toMatchObject({
      automationState: 'manual',
      metadata: expect.objectContaining({
        lastWorkflowTriggerJobId: 'workflow-job-retry',
        workflowTriggerError: null,
        workflowTriggerFailedAt: null,
      }),
    });
  });

  it('keeps the messages surface lifecycle connected from ingestion to workflow approval', async () => {
    const { conversations, messages, queueService, service, youtubeService } =
      createContext();
    const scope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const inboundInput = {
      body: '<p>Need pricing help</p>',
      brandId: 'brand-1',
      conversationType: 'comment',
      credentialId: 'credential-1',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      externalParentId: 'comment-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      participantHandle: '@taylor',
      participantName: 'Taylor',
      platform: 'youtube',
      sourceContentId: 'video-1',
      sourceContentTitle: 'Launch video',
      sourceContentUrl: 'https://youtube.com/watch?v=video-1',
      userId: 'user-1',
    };

    const inbound = await service.ingestInboundMessage(inboundInput);
    const duplicate = await service.ingestInboundMessage(inboundInput);

    expect(duplicate.id).toBe(inbound.id);
    expect(
      messages.filter((message) => message.direction === 'inbound'),
    ).toHaveLength(1);
    expect(queueService.queueTriggerEvent).toHaveBeenCalledTimes(1);

    const inbox = await service.listConversations(scope, {
      platform: 'youtube',
      search: 'pricing',
      unread: true,
    });
    expect(inbox.docs).toHaveLength(1);
    expect(inbox.docs[0]).toMatchObject({
      availability: expect.objectContaining({
        canPostReply: true,
        canSendDm: false,
      }),
      id: inbound.conversationId,
      latestMessageText: 'Need pricing help',
      unreadCount: 1,
    });

    const draft = await service.createDraft(scope, inbound.conversationId, {
      agentRunId: 'agent-run-1',
      messageType: 'reply',
      text: '<strong>Try this answer</strong>',
      workflowRunId: 'workflow-run-1',
    });
    expect(draft).toMatchObject({
      actionProvenance: {
        action: 'draft',
        actedAt: expect.any(String),
        actorType: 'agent',
        agentRunId: 'agent-run-1',
        platform: 'youtube',
        status: 'draft',
        userId: 'user-1',
        workflowRunId: 'workflow-run-1',
      },
      body: 'Try this answer',
      status: 'draft',
    });

    const threadBeforeApproval = await service.listMessages(
      scope,
      inbound.conversationId,
      { limit: 10 },
    );
    expect(threadBeforeApproval.docs.map((message) => message.status)).toEqual(
      expect.arrayContaining(['received', 'draft']),
    );

    const sent = await service.approveDraft(
      scope,
      inbound.conversationId,
      draft.id,
    );

    expect(youtubeService.postCommentReply).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'comment-1',
      'Try this answer',
    );
    expect(sent).toMatchObject({
      actionProvenance: {
        action: 'post_reply',
        actedAt: expect.any(String),
        actorType: 'agent',
        agentRunId: 'agent-run-1',
        platform: 'youtube',
        status: 'sent',
        userId: 'user-1',
        workflowRunId: 'workflow-run-1',
      },
      status: 'sent',
      workflowRunId: 'workflow-run-1',
    });
    expect(messages.find((message) => message.id === draft.id)).toMatchObject({
      actionProvenance: expect.objectContaining({
        approvedBy: 'user-1',
        approvedMessageId: sent.id,
      }),
      status: 'approved',
    });
    expect(conversations[0]).toMatchObject({
      automationState: 'automated',
      latestMessageText: 'Try this answer',
      needsReview: false,
      unreadCount: 0,
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

  describe('ingestYoutubeComments', () => {
    function seedSweep(context: TestContext): void {
      context.prisma.credential.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          externalHandle: '@channel',
          externalId: 'channel-1',
          externalName: 'Channel',
          id: 'credential-1',
          label: 'Channel',
          userId: 'user-1',
          username: 'channel',
        },
      ]);
      context.prisma.post.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          description: 'Launch recap',
          externalId: 'video-1',
          id: 'post-1',
          label: 'Launch',
          url: 'https://youtube.com/watch?v=video-1',
        },
      ]);
      // Two comments share thread-1 (a comment + its reply); one is on thread-2.
      context.youtubeService.listVideoComments.mockResolvedValue([
        {
          authorChannelId: 'author-1',
          authorDisplayName: 'Taylor',
          commentId: 'comment-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          text: 'First comment',
          threadId: 'thread-1',
        },
        {
          authorChannelId: 'author-2',
          authorDisplayName: 'Jordan',
          commentId: 'comment-2',
          createdAt: new Date('2026-01-01T00:01:00.000Z'),
          text: 'Reply in same thread',
          threadId: 'thread-1',
        },
        {
          authorChannelId: 'author-3',
          authorDisplayName: 'Sam',
          commentId: 'comment-3',
          createdAt: new Date('2026-01-01T00:02:00.000Z'),
          text: 'Another thread',
          threadId: 'thread-2',
        },
      ]);
    }

    it('dedups via batched findMany keyed by external ids, scoped to the org', async () => {
      const context = createContext();
      seedSweep(context);

      const result = await context.service.ingestYoutubeComments(
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        { limit: 50 },
      );

      // thread-1 counted once despite two comments; thread-2 once.
      expect(result).toEqual({ conversationsCreated: 2, messagesCreated: 3 });
      expect(context.conversations).toHaveLength(2);
      expect(context.messages).toHaveLength(3);

      // One batched lookup per entity for the post, not a findFirst pair each.
      expect(context.prisma.socialConversation.findMany).toHaveBeenCalledTimes(
        1,
      );
      expect(context.prisma.socialMessage.findMany).toHaveBeenCalledTimes(1);

      const conversationWhere =
        context.prisma.socialConversation.findMany.mock.calls[0][0].where;
      expect(conversationWhere).toMatchObject({
        externalConversationId: { in: ['thread-1', 'thread-2'] },
        isDeleted: false,
        organizationId: 'org-1',
        platform: 'youtube',
      });

      const messageWhere =
        context.prisma.socialMessage.findMany.mock.calls[0][0].where;
      expect(messageWhere).toMatchObject({
        externalMessageId: { in: ['comment-1', 'comment-2', 'comment-3'] },
        isDeleted: false,
        organizationId: 'org-1',
        platform: 'youtube',
      });
    });

    it('is idempotent — a second sweep of the same comments creates nothing new', async () => {
      const context = createContext();
      seedSweep(context);
      const scope = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };

      await context.service.ingestYoutubeComments(scope, { limit: 50 });
      const second = await context.service.ingestYoutubeComments(scope, {
        limit: 50,
      });

      expect(second).toEqual({ conversationsCreated: 0, messagesCreated: 0 });
      expect(context.conversations).toHaveLength(2);
      expect(context.messages).toHaveLength(3);
    });
  });
});
