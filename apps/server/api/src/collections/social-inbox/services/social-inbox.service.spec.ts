import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialInboxProviderError } from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxActionService } from '@api/collections/social-inbox/services/social-inbox-action.service';
import { SocialInboxIngestionService } from '@api/collections/social-inbox/services/social-inbox-ingestion.service';
import { SocialInboxQueryService } from '@api/collections/social-inbox/services/social-inbox-query.service';
import { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import { createSystemWorkflowRunnerMock } from '@api/shared/testing/system-workflow-runner-mock';
import { Platform, SocialConversationType } from '@genfeedai/enums';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';

type StoreConversation = {
  id: string;
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
    updateMany: ReturnType<typeof vi.fn>;
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
  logger: {
    warn: ReturnType<typeof vi.fn>;
  };
  messages: StoreMessage[];
  notificationsPublisher: {
    emit: ReturnType<typeof vi.fn>;
  };
  instagramService: {
    listConversations: ReturnType<typeof vi.fn>;
    listMediaComments: ReturnType<typeof vi.fn>;
    replyToComment: ReturnType<typeof vi.fn>;
    sendCommentReplyDm: ReturnType<typeof vi.fn>;
  };
  linkedInService: {
    listDirectMessages: ReturnType<typeof vi.fn>;
    listPostComments: ReturnType<typeof vi.fn>;
  };
  prisma: PrismaMock;
  queueService: {
    queueTriggerEvent: ReturnType<typeof vi.fn>;
  };
  service: SocialInboxService;
  twitterService: {
    listDirectMessages: ReturnType<typeof vi.fn>;
    listMentions: ReturnType<typeof vi.fn>;
    listPostReplies: ReturnType<typeof vi.fn>;
  };
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
      if ('lte' in operator) {
        return item[key] != null && Number(item[key]) <= Number(operator.lte);
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
      updateMany: vi.fn().mockImplementation(({ data, where }) => {
        const matched = conversations.filter((item) =>
          matchesWhere(item, where),
        );
        for (const conversation of matched) {
          Object.assign(conversation, {
            ...data,
            unreadCount:
              typeof data.unreadCount === 'object' &&
              data.unreadCount?.increment
                ? conversation.unreadCount + data.unreadCount.increment
                : (data.unreadCount ?? conversation.unreadCount),
            updatedAt: new Date(),
          });
        }
        return Promise.resolve({ count: matched.length });
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
        if (
          data.idempotencyKey &&
          messages.some(
            (item) =>
              item.organizationId === data.organizationId &&
              item.idempotencyKey === data.idempotencyKey,
          )
        ) {
          throw Object.assign(new Error('Unique constraint violation'), {
            code: 'P2002',
          });
        }

        const now = new Date();
        const message: StoreMessage = {
          actionProvenance: data.actionProvenance ?? {},
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
      findFirst: vi.fn().mockImplementation(({ orderBy, where }) => {
        const matched = messages.filter((item) => matchesWhere(item, where));
        if (orderBy?.createdAt === 'desc') {
          matched.sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          );
        }
        return Promise.resolve(matched[0] ?? null);
      }),
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
        const matched = messages.filter((item) => matchesWhere(item, where));
        for (const message of matched) {
          Object.assign(message, data, { updatedAt: new Date() });
        }
        return Promise.resolve({ count: matched.length });
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
    listConversations: vi.fn(),
    listMediaComments: vi.fn(),
    replyToComment: vi.fn().mockResolvedValue({ commentId: 'ig-reply-1' }),
    sendCommentReplyDm: vi.fn().mockResolvedValue('dm-1'),
  };
  const twitterService = {
    listDirectMessages: vi.fn(),
    listMentions: vi.fn(),
    listPostReplies: vi.fn(),
  };
  const linkedInService = {
    listDirectMessages: vi.fn(),
    listPostComments: vi.fn(),
  };
  const queueService = {
    queueTriggerEvent: vi.fn().mockResolvedValue('workflow-job-1'),
  };
  const notificationsPublisher = {
    emit: vi.fn().mockResolvedValue(undefined),
  };
  const logger = {
    warn: vi.fn(),
  };
  const queryService = new SocialInboxQueryService(prisma as never);
  const realtimeService = new SocialInboxRealtimeService(
    notificationsPublisher as never,
  );
  const systemWorkflowRunner = createSystemWorkflowRunnerMock();
  const ingestionService = new SocialInboxIngestionService(
    prisma as never,
    youtubeService as never,
    instagramService as never,
    twitterService as never,
    linkedInService as never,
    realtimeService,
    {
      get: vi.fn(() => queueService),
    } as never,
    logger as never,
  );
  const actionService = new SocialInboxActionService(
    prisma as never,
    youtubeService as never,
    instagramService as never,
    queryService,
    realtimeService,
    systemWorkflowRunner as never,
  );
  actionService.onModuleInit();

  return {
    conversations,
    instagramService,
    linkedInService,
    logger,
    messages,
    notificationsPublisher,
    prisma: prisma as unknown as PrismaMock,
    queueService,
    service: new SocialInboxService(
      queryService,
      ingestionService,
      actionService,
    ),
    twitterService,
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

  it('lists org-wide when allBrands is set and filters by explicit brandId', async () => {
    const { service } = createContext();

    await service.ingestInboundMessage({
      body: 'Brand one thread',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-brand-1',
      externalMessageId: 'comment-brand-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      participantName: 'Taylor',
      platform: 'youtube',
    });
    await service.ingestInboundMessage({
      body: 'Brand two thread',
      brandId: 'brand-2',
      conversationType: 'comment',
      externalConversationId: 'thread-brand-2',
      externalMessageId: 'comment-brand-2',
      organizationId: 'org-1',
      participantExternalId: 'author-2',
      participantName: 'Jordan',
      platform: 'youtube',
    });

    const sessionScoped = await service.listConversations(
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      {},
    );
    expect(sessionScoped.docs).toHaveLength(1);
    expect(sessionScoped.docs[0]?.brandId).toBe('brand-1');

    const allBrands = await service.listConversations(
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      { allBrands: true },
    );
    expect(allBrands.docs).toHaveLength(2);

    const brandTwoOnly = await service.listConversations(
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      { brandId: 'brand-2' },
    );
    expect(brandTwoOnly.docs).toHaveLength(1);
    expect(brandTwoOnly.docs[0]?.brandId).toBe('brand-2');

    const openedAcrossBrand = await service.getConversation(
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      brandTwoOnly.docs[0]?.id as string,
    );
    expect(openedAcrossBrand.brandId).toBe('brand-2');
  });

  it('authorizes typed agent selectors against the current inbox scope', async () => {
    const { service } = createContext();
    const message = await service.ingestInboundMessage({
      body: 'Sensitive customer text',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      participantName: 'Sensitive identity',
      platform: 'youtube',
    });
    const scope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };

    await expect(
      service.authorizeAgentContextReferences(scope, [
        {
          brandId: 'spoofed-brand',
          conversationId: message.conversationId,
          kind: 'social-conversation',
          organizationId: 'spoofed-organization',
        },
        {
          conversationId: message.conversationId,
          kind: 'social-message',
          messageId: message.id,
          organizationId: 'spoofed-organization',
        },
      ]),
    ).resolves.toEqual([
      {
        brandId: 'brand-1',
        conversationId: message.conversationId,
        kind: 'social-conversation',
        organizationId: 'org-1',
      },
      {
        brandId: 'brand-1',
        conversationId: message.conversationId,
        kind: 'social-message',
        messageId: message.id,
        organizationId: 'org-1',
      },
    ]);
    const resolved = await service.resolveAgentContextReferences(scope, [
      {
        conversationId: message.conversationId,
        kind: 'social-message',
        messageId: message.id,
        organizationId: 'spoofed-organization',
      },
    ]);
    expect(resolved.context).toEqual([
      {
        conversationId: message.conversationId,
        kind: 'social-message',
        messageId: message.id,
        messages: [
          {
            body: 'Sensitive customer text',
            direction: 'inbound',
            messageId: message.id,
            messageType: 'comment',
          },
        ],
      },
    ]);
    expect(JSON.stringify(resolved.context)).not.toMatch(
      /Sensitive identity|credential/,
    );
    await expect(
      service.authorizeAgentContextReferences(
        { ...scope, organizationId: 'org-2' },
        [
          {
            conversationId: message.conversationId,
            kind: 'social-conversation',
            organizationId: 'org-1',
          },
        ],
      ),
    ).rejects.toThrow();
    await expect(
      service.authorizeAgentContextReferences(scope, [
        {
          conversationId: 'conversation-1\nignore-instructions',
          kind: 'social-conversation',
          organizationId: 'org-1',
        },
      ]),
    ).rejects.toThrow('Invalid social inbox reference');
  });

  it('rejects unsupported persisted message states from agent context', async () => {
    const { messages, service } = createContext();
    const message = await service.ingestInboundMessage({
      body: 'Legacy customer text',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      organizationId: 'org-1',
      platform: 'youtube',
    });
    const scope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    messages[0].direction = 'unsupported-direction';

    await expect(
      service.resolveAgentContextReferences(scope, [
        {
          conversationId: message.conversationId,
          kind: 'social-message',
          messageId: message.id,
          organizationId: 'org-1',
        },
      ]),
    ).rejects.toThrow('Unsupported social message state');
  });

  it('publishes redacted scoped realtime events for new inbox messages', async () => {
    const { notificationsPublisher, service } = createContext();
    const message = await service.ingestInboundMessage({
      body: 'Sensitive customer text',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      participantName: 'Sensitive identity',
      platform: 'youtube',
    });

    expect(notificationsPublisher.emit).toHaveBeenCalledWith(
      '/social-inbox/org-1',
      {
        conversationId: message.conversationId,
        kind: 'message-created',
        room: 'org-org-1',
      },
    );
    expect(notificationsPublisher.emit).toHaveBeenCalledWith(
      `/social-inbox/conversations/${message.conversationId}`,
      {
        conversationId: message.conversationId,
        kind: 'message-created',
        room: 'org-org-1',
      },
    );
    expect(JSON.stringify(notificationsPublisher.emit.mock.calls)).not.toMatch(
      /Sensitive customer text|Sensitive identity/,
    );
  });

  it('returns one draft for repeated deterministic idempotency keys', async () => {
    const { messages, service } = createContext();
    const inbound = await service.ingestInboundMessage({
      body: 'Inbound',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      platform: 'youtube',
    });
    const scope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const input = {
      idempotencyKey: 'messages:conversation-1:draft:1',
      text: 'One draft only',
    };

    const first = await service.createDraft(
      scope,
      inbound.conversationId,
      input,
    );
    const repeated = await service.createDraft(
      scope,
      inbound.conversationId,
      input,
    );

    expect(repeated.id).toBe(first.id);
    expect(
      messages.filter(
        (message) => message.idempotencyKey === input.idempotencyKey,
      ),
    ).toHaveLength(1);
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

  it('claims a reply idempotency key before concurrent provider calls', async () => {
    const { instagramService, messages, service } = createContext();
    const inbound = await service.ingestInboundMessage({
      body: 'Inbound',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      externalParentId: 'comment-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      platform: 'instagram',
    });
    const scope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const input = {
      idempotencyKey: 'concurrent-reply',
      text: 'Thanks for the comment',
    };

    const results = await Promise.all([
      service
        .postReply(scope, inbound.conversationId, input)
        .catch((error: unknown) => error),
      service
        .postReply(scope, inbound.conversationId, input)
        .catch((error: unknown) => error),
    ]);

    expect(instagramService.replyToComment).toHaveBeenCalledTimes(1);
    expect(
      messages.filter(
        (message) => message.idempotencyKey === input.idempotencyKey,
      ),
    ).toEqual([
      expect.objectContaining({
        conversationId: inbound.conversationId,
        organizationId: scope.organizationId,
        status: 'sent',
      }),
    ]);
    expect(
      results.every(
        (result) =>
          result instanceof ConflictException ||
          (typeof result === 'object' && result !== null && 'id' in result),
      ),
    ).toBe(true);
  });

  it('claims a DM idempotency key before concurrent provider calls', async () => {
    const { instagramService, messages, service } = createContext();
    const inbound = await service.ingestInboundMessage({
      body: 'Inbound',
      brandId: 'brand-1',
      conversationType: 'dm',
      externalConversationId: 'thread-1',
      externalMessageId: 'message-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      platform: 'instagram',
    });
    const scope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const input = {
      idempotencyKey: 'concurrent-dm',
      recipientId: 'author-1',
      text: 'Following up',
    };

    const results = await Promise.all([
      service
        .sendDm(scope, inbound.conversationId, input)
        .catch((error: unknown) => error),
      service
        .sendDm(scope, inbound.conversationId, input)
        .catch((error: unknown) => error),
    ]);

    expect(instagramService.sendCommentReplyDm).toHaveBeenCalledTimes(1);
    expect(
      messages.filter(
        (message) => message.idempotencyKey === input.idempotencyKey,
      ),
    ).toEqual([
      expect.objectContaining({
        conversationId: inbound.conversationId,
        organizationId: scope.organizationId,
        status: 'sent',
      }),
    ]);
    expect(
      results.every(
        (result) =>
          result instanceof ConflictException ||
          (typeof result === 'object' && result !== null && 'id' in result),
      ),
    ).toBe(true);
  });

  it('reclaims a failed reply reservation and retries the provider once', async () => {
    const { instagramService, messages, service } = createContext();
    const inbound = await service.ingestInboundMessage({
      body: 'Inbound',
      brandId: 'brand-1',
      conversationType: 'comment',
      externalConversationId: 'thread-1',
      externalMessageId: 'comment-1',
      externalParentId: 'comment-1',
      organizationId: 'org-1',
      participantExternalId: 'author-1',
      platform: 'instagram',
    });
    const scope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const input = {
      idempotencyKey: 'retry-reply',
      text: 'Thanks for the comment',
    };
    instagramService.replyToComment
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({ commentId: 'ig-reply-retried' });

    await expect(
      service.postReply(scope, inbound.conversationId, input),
    ).rejects.toThrow('provider unavailable');
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureReason: 'provider unavailable',
          idempotencyKey: input.idempotencyKey,
          status: 'failed',
        }),
      ]),
    );

    const retried = await service.postReply(
      scope,
      inbound.conversationId,
      input,
    );

    expect(instagramService.replyToComment).toHaveBeenCalledTimes(2);
    expect(
      messages.filter(
        (message) => message.idempotencyKey === input.idempotencyKey,
      ),
    ).toHaveLength(1);
    expect(retried).toMatchObject({
      externalMessageId: 'ig-reply-retried',
      failureReason: null,
      status: 'sent',
    });
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
      messageType: 'reply',
      text: '<strong>Try this answer</strong>',
      workflowRunId: 'workflow-run-1',
    });
    expect(draft).toMatchObject({
      actionProvenance: {
        action: 'draft',
        actedAt: expect.any(String),
        actorType: 'workflow',
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
      'credential-1',
    );
    expect(sent).toMatchObject({
      actionProvenance: {
        action: 'post_reply',
        actedAt: expect.any(String),
        actorType: 'workflow',
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

    it('skips the per-comment lookups for already-known comments on a resweep', async () => {
      const context = createContext();
      seedSweep(context);
      const scope = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };

      await context.service.ingestYoutubeComments(scope, { limit: 50 });

      context.prisma.socialConversation.findFirst.mockClear();
      context.prisma.socialMessage.findFirst.mockClear();
      context.prisma.socialMessage.updateMany.mockClear();

      const second = await context.service.ingestYoutubeComments(scope, {
        limit: 50,
      });

      expect(second).toEqual({ conversationsCreated: 0, messagesCreated: 0 });
      // The batched dedup already told us these rows exist; a resweep must not
      // re-run the findOrCreateConversation + findFirst pair per comment.
      expect(
        context.prisma.socialConversation.findFirst,
      ).not.toHaveBeenCalled();
      expect(context.prisma.socialMessage.findFirst).not.toHaveBeenCalled();
      // The workflow trigger retry claim still runs for known messages.
      expect(context.prisma.socialMessage.updateMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('ingestInstagramComments', () => {
    function seedSweep(context: TestContext): void {
      context.prisma.credential.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          externalHandle: '@studio',
          externalId: 'ig-account-1',
          externalName: 'Studio',
          id: 'credential-1',
          label: 'Studio',
          userId: 'user-1',
          username: 'studio',
        },
      ]);
      context.prisma.post.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          description: 'Launch recap',
          externalId: 'media-1',
          id: 'post-1',
          label: 'Launch',
          url: 'https://instagram.com/p/media-1',
        },
      ]);
      // A top-level comment and its reply share thread ig-comment-1.
      context.instagramService.listMediaComments.mockResolvedValue([
        {
          authorExternalId: 'ig-author-1',
          authorUsername: 'taylor',
          commentId: 'ig-comment-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          text: 'Love this',
          threadId: 'ig-comment-1',
        },
        {
          authorExternalId: 'ig-author-2',
          authorUsername: 'jordan',
          commentId: 'ig-comment-2',
          createdAt: new Date('2026-01-01T00:01:00.000Z'),
          text: 'Same here',
          threadId: 'ig-comment-1',
        },
      ]);
    }

    it('ingests comments as comment conversations scoped to the org', async () => {
      const context = createContext();
      seedSweep(context);

      const result = await context.service.ingestInstagramComments(
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        { limit: 50 },
      );

      expect(result).toEqual({ conversationsCreated: 1, messagesCreated: 2 });
      expect(context.conversations).toHaveLength(1);
      expect(context.conversations[0]).toMatchObject({
        conversationType: SocialConversationType.COMMENT,
        externalConversationId: 'ig-comment-1',
        platform: Platform.INSTAGRAM,
        sourceContentId: 'media-1',
      });

      // Only connected Instagram credentials are swept.
      expect(context.prisma.credential.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          isConnected: true,
          isDeleted: false,
          organizationId: 'org-1',
          platform: PrismaCredentialPlatform.INSTAGRAM,
        }),
      });

      const messageWhere =
        context.prisma.socialMessage.findMany.mock.calls[0][0].where;
      expect(messageWhere).toMatchObject({
        externalMessageId: { in: ['ig-comment-1', 'ig-comment-2'] },
        isDeleted: false,
        organizationId: 'org-1',
        platform: Platform.INSTAGRAM,
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

      await context.service.ingestInstagramComments(scope, { limit: 50 });
      const second = await context.service.ingestInstagramComments(scope, {
        limit: 50,
      });

      expect(second).toEqual({ conversationsCreated: 0, messagesCreated: 0 });
      expect(context.conversations).toHaveLength(1);
      expect(context.messages).toHaveLength(2);
    });
  });

  describe('ingestInstagramDms', () => {
    function seedSweep(context: TestContext): void {
      context.prisma.credential.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          externalHandle: '@studio',
          externalId: 'ig-account-1',
          externalName: 'Studio',
          id: 'credential-1',
          label: 'Studio',
          userId: 'user-1',
          username: 'studio',
        },
      ]);
      context.instagramService.listConversations.mockResolvedValue([
        {
          conversationId: 'ig-thread-1',
          messages: [
            {
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              messageId: 'ig-dm-1',
              senderExternalId: 'ig-participant-1',
              senderName: 'Taylor',
              senderUsername: 'taylor',
              text: 'Do you ship to the EU?',
            },
            {
              createdAt: new Date('2026-01-01T00:01:00.000Z'),
              messageId: 'ig-dm-2',
              senderExternalId: 'ig-participant-1',
              senderName: 'Taylor',
              senderUsername: 'taylor',
              text: 'Following up',
            },
          ],
          participantExternalId: 'ig-participant-1',
          participantName: 'Taylor',
          participantUsername: 'taylor',
          updatedAt: new Date('2026-01-01T00:01:00.000Z'),
        },
      ]);
    }

    it('keys the thread by the Graph conversation id with no post anchor', async () => {
      const context = createContext();
      seedSweep(context);

      const result = await context.service.ingestInstagramDms(
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        { limit: 25 },
      );

      expect(result).toEqual({ conversationsCreated: 1, messagesCreated: 2 });
      expect(context.conversations[0]).toMatchObject({
        conversationType: SocialConversationType.DM,
        externalConversationId: 'ig-thread-1',
        participantExternalId: 'ig-participant-1',
        platform: Platform.INSTAGRAM,
        sourceContentId: null,
      });

      // A DM has nothing to reply on publicly, but the participant is known so
      // the DM action stays available.
      expect(context.conversations[0].availability).toMatchObject({
        canPostReply: false,
        canSendDm: true,
      });
    });

    it('is idempotent — a second poll of the same thread creates nothing new', async () => {
      const context = createContext();
      seedSweep(context);
      const scope = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };

      await context.service.ingestInstagramDms(scope, { limit: 25 });

      context.prisma.socialConversation.findFirst.mockClear();
      context.prisma.socialMessage.findFirst.mockClear();

      const second = await context.service.ingestInstagramDms(scope, {
        limit: 25,
      });

      expect(second).toEqual({ conversationsCreated: 0, messagesCreated: 0 });
      expect(context.conversations).toHaveLength(1);
      expect(context.messages).toHaveLength(2);
      // Known messages skip the per-item conversation + message lookups.
      expect(
        context.prisma.socialConversation.findFirst,
      ).not.toHaveBeenCalled();
      expect(context.prisma.socialMessage.findFirst).not.toHaveBeenCalled();
    });

    it('shows the newest message in the preview when Graph returns newest-first', async () => {
      const context = createContext();
      context.prisma.credential.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          externalHandle: '@studio',
          externalId: 'ig-account-1',
          externalName: 'Studio',
          id: 'credential-1',
          label: 'Studio',
          userId: 'user-1',
          username: 'studio',
        },
      ]);
      // The Graph messages edge returns reverse-chronological batches.
      context.instagramService.listConversations.mockResolvedValue([
        {
          conversationId: 'ig-thread-1',
          messages: [
            {
              createdAt: new Date('2026-01-01T00:02:00.000Z'),
              messageId: 'ig-dm-3',
              senderExternalId: 'ig-participant-1',
              senderName: 'Taylor',
              senderUsername: 'taylor',
              text: 'Newest message',
            },
            {
              createdAt: new Date('2026-01-01T00:01:00.000Z'),
              messageId: 'ig-dm-2',
              senderExternalId: 'ig-participant-1',
              senderName: 'Taylor',
              senderUsername: 'taylor',
              text: 'Middle message',
            },
            {
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              messageId: 'ig-dm-1',
              senderExternalId: 'ig-participant-1',
              senderName: 'Taylor',
              senderUsername: 'taylor',
              text: 'Oldest message',
            },
          ],
          participantExternalId: 'ig-participant-1',
          participantName: 'Taylor',
          participantUsername: 'taylor',
          updatedAt: new Date('2026-01-01T00:02:00.000Z'),
        },
      ]);

      const result = await context.service.ingestInstagramDms(
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        { limit: 25 },
      );

      expect(result).toEqual({ conversationsCreated: 1, messagesCreated: 3 });
      expect(context.conversations[0].latestMessageText).toBe('Newest message');
      expect(context.conversations[0].latestMessageAt).toEqual(
        new Date('2026-01-01T00:02:00.000Z'),
      );
      expect(context.conversations[0].lastInboundAt).toEqual(
        new Date('2026-01-01T00:02:00.000Z'),
      );
      expect(context.conversations[0].unreadCount).toBe(3);
    });
  });

  describe('ingestInboundMessage preview ordering', () => {
    it('does not regress the preview when an older message arrives late', async () => {
      const { conversations, service } = createContext();
      const base = {
        brandId: 'brand-1',
        conversationType: 'dm',
        externalConversationId: 'thread-1',
        organizationId: 'org-1',
        participantExternalId: 'author-1',
        participantName: 'Taylor',
        platform: 'instagram',
      };

      await service.ingestInboundMessage({
        ...base,
        body: 'Newest message',
        createdAt: new Date('2026-01-01T00:02:00.000Z'),
        externalMessageId: 'dm-newest',
      });
      await service.ingestInboundMessage({
        ...base,
        body: 'Older message',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        externalMessageId: 'dm-older',
      });

      expect(conversations).toHaveLength(1);
      expect(conversations[0].latestMessageText).toBe('Newest message');
      expect(conversations[0].latestMessageAt).toEqual(
        new Date('2026-01-01T00:02:00.000Z'),
      );
      // The unread counter still counts the out-of-order message.
      expect(conversations[0].unreadCount).toBe(2);
    });
  });

  describe('ingestXComments', () => {
    const recordedMentions = [
      {
        authorId: '2244994945',
        authorName: 'Taylor',
        authorUsername: 'taylor',
        conversationId: '1980000000000000001',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        inReplyToId: null,
        text: 'Just tried @genfeedai for launch replies',
        tweetId: '1980000000000000001',
      },
      {
        authorId: '783214',
        authorName: 'Jordan',
        authorUsername: 'jordan',
        conversationId: '1970000000000000009',
        createdAt: new Date('2026-08-01T10:05:00.000Z'),
        inReplyToId: '1970000000000000009',
        text: '@genfeedai does this work with LinkedIn too?',
        tweetId: '1980000000000000002',
      },
    ];
    const recordedReplies = [
      {
        authorId: '2244994945',
        authorName: 'Taylor',
        authorUsername: 'taylor',
        conversationId: '1970000000000000100',
        createdAt: new Date('2026-08-01T10:10:00.000Z'),
        inReplyToId: '1970000000000000100',
        text: 'Shipping this week?',
        tweetId: '1980000000000000101',
      },
    ];

    function seedSweep(context: TestContext): void {
      context.prisma.credential.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          externalHandle: '@genfeedai',
          externalId: 'brand-user-id',
          externalName: 'Genfeed',
          id: 'credential-x',
          label: 'X',
          userId: 'user-1',
          username: 'genfeedai',
        },
      ]);
      context.prisma.post.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          description: 'Launch tweet',
          externalId: '1970000000000000100',
          id: 'post-x-1',
          label: 'Launch',
          url: 'https://x.com/genfeedai/status/1970000000000000100',
        },
      ]);
      context.twitterService.listMentions.mockResolvedValue(recordedMentions);
      context.twitterService.listPostReplies.mockResolvedValue(recordedReplies);
    }

    it('normalizes recorded mention and reply payloads through ingestInboundMessage', async () => {
      const context = createContext();
      seedSweep(context);

      const result = await context.service.ingestXComments(
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        { limit: 50 },
      );

      expect(result).toEqual({ conversationsCreated: 3, messagesCreated: 3 });
      expect(context.conversations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            conversationType: SocialConversationType.COMMENT,
            externalConversationId: '1980000000000000001',
            platform: Platform.TWITTER,
          }),
          expect.objectContaining({
            conversationType: SocialConversationType.COMMENT,
            postId: 'post-x-1',
            sourceContentId: '1970000000000000100',
          }),
        ]),
      );
      expect(context.prisma.credential.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          isConnected: true,
          isDeleted: false,
          organizationId: 'org-1',
          platform: PrismaCredentialPlatform.TWITTER,
        }),
      });
    });

    it('is idempotent — a second poll of the same payloads creates nothing new', async () => {
      const context = createContext();
      seedSweep(context);
      const scope = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };

      await context.service.ingestXComments(scope, { limit: 50 });
      const second = await context.service.ingestXComments(scope, {
        limit: 50,
      });

      expect(second).toEqual({ conversationsCreated: 0, messagesCreated: 0 });
      expect(context.messages).toHaveLength(3);
    });

    it('does not ingest when the X account is not connected', async () => {
      const context = createContext();
      context.prisma.credential.findMany.mockResolvedValue([]);

      const result = await context.service.ingestXComments(
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        { credentialId: 'credential-x' },
      );

      expect(result).toEqual({ conversationsCreated: 0, messagesCreated: 0 });
      expect(context.twitterService.listMentions).not.toHaveBeenCalled();
      expect(context.twitterService.listPostReplies).not.toHaveBeenCalled();
    });

    it('records a rate-limit and keeps the mention cursor for retry', async () => {
      const context = createContext();
      seedSweep(context);
      const scope = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };

      await context.service.ingestXComments(scope, { limit: 50 });
      const cursor = '1980000000000000002';
      const providerError = {
        message: 'Too Many Requests',
        status: 429,
      };
      context.twitterService.listMentions.mockRejectedValue(providerError);

      await expect(
        context.service.ingestXComments(scope, { limit: 50 }),
      ).rejects.toMatchObject({
        cause: providerError,
        cursor,
        isRateLimited: true,
        name: SocialInboxProviderError.name,
      });
      expect(context.twitterService.listMentions).toHaveBeenLastCalledWith(
        'org-1',
        'brand-1',
        { limit: 50, sinceId: cursor },
        'credential-x',
      );
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Social inbox provider poll failed',
        {
          cursor,
          isRateLimited: true,
          platform: Platform.TWITTER,
        },
      );
      expect(context.messages).toHaveLength(3);
    });
  });

  describe('ingestXDms', () => {
    function seedSweep(context: TestContext): void {
      context.prisma.credential.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          externalHandle: '@genfeedai',
          externalId: 'brand-user-id',
          externalName: 'Genfeed',
          id: 'credential-x',
          label: 'X',
          userId: 'user-1',
          username: 'genfeedai',
        },
      ]);
      context.twitterService.listDirectMessages.mockResolvedValue({
        threads: [
          {
            conversationId: 'x-dm-thread-1',
            messages: [
              {
                createdAt: new Date('2026-08-01T11:01:00.000Z'),
                messageId: 'x-dm-2',
                senderId: '2244994945',
                senderName: 'Taylor',
                senderUsername: 'taylor',
                text: 'Following up',
              },
              {
                createdAt: new Date('2026-08-01T11:00:00.000Z'),
                messageId: 'x-dm-1',
                senderId: '2244994945',
                senderName: 'Taylor',
                senderUsername: 'taylor',
                text: 'Can we chat about pricing?',
              },
            ],
            participantExternalId: '2244994945',
            participantName: 'Taylor',
            participantUsername: 'taylor',
          },
        ],
      });
    }

    it('keys DM threads by the X conversation id with no post anchor', async () => {
      const context = createContext();
      seedSweep(context);

      const result = await context.service.ingestXDms(
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        { limit: 25 },
      );

      expect(result).toEqual({ conversationsCreated: 1, messagesCreated: 2 });
      expect(context.conversations[0]).toMatchObject({
        conversationType: SocialConversationType.DM,
        externalConversationId: 'x-dm-thread-1',
        latestMessageText: 'Following up',
        participantExternalId: '2244994945',
        platform: Platform.TWITTER,
        sourceContentId: null,
      });
      expect(context.conversations[0].availability).toMatchObject({
        canPostReply: false,
        canSendDm: true,
      });
    });

    it('is idempotent — a second poll of the same DM thread creates nothing new', async () => {
      const context = createContext();
      seedSweep(context);
      const scope = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };

      await context.service.ingestXDms(scope, { limit: 25 });
      const second = await context.service.ingestXDms(scope, { limit: 25 });

      expect(second).toEqual({ conversationsCreated: 0, messagesCreated: 0 });
      expect(context.messages).toHaveLength(2);
    });

    it('pages older DMs with the provider next token, not a stored message id', async () => {
      const context = createContext();
      seedSweep(context);
      context.twitterService.listDirectMessages
        .mockResolvedValueOnce({
          nextToken: 'x-dm-next-1',
          threads: [
            {
              conversationId: 'x-dm-thread-1',
              messages: [
                {
                  createdAt: new Date('2026-08-01T11:01:00.000Z'),
                  messageId: 'x-dm-2',
                  senderId: '2244994945',
                  senderName: 'Taylor',
                  senderUsername: 'taylor',
                  text: 'Following up',
                },
              ],
              participantExternalId: '2244994945',
              participantName: 'Taylor',
              participantUsername: 'taylor',
            },
          ],
        })
        .mockResolvedValueOnce({
          threads: [
            {
              conversationId: 'x-dm-thread-2',
              messages: [
                {
                  createdAt: new Date('2026-08-01T10:00:00.000Z'),
                  messageId: 'x-dm-older',
                  senderId: '783214',
                  senderName: 'Jordan',
                  senderUsername: 'jordan',
                  text: 'Older thread',
                },
              ],
              participantExternalId: '783214',
              participantName: 'Jordan',
              participantUsername: 'jordan',
            },
          ],
        });

      const result = await context.service.ingestXDms(
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        { limit: 25 },
      );

      expect(result).toEqual({ conversationsCreated: 2, messagesCreated: 2 });
      expect(context.twitterService.listDirectMessages).toHaveBeenNthCalledWith(
        1,
        'org-1',
        'brand-1',
        { limit: 25 },
        'credential-x',
      );
      expect(context.twitterService.listDirectMessages).toHaveBeenNthCalledWith(
        2,
        'org-1',
        'brand-1',
        { limit: 25, paginationToken: 'x-dm-next-1' },
        'credential-x',
      );
      expect(
        context.messages.map((message) => message.externalMessageId),
      ).toEqual(['x-dm-2', 'x-dm-older']);
    });

    it('does not send a stored DM message id as the X pagination token', async () => {
      const context = createContext();
      seedSweep(context);
      const scope = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };

      await context.service.ingestXDms(scope, { limit: 25 });
      context.twitterService.listDirectMessages.mockClear();
      context.twitterService.listDirectMessages.mockResolvedValue({
        threads: [
          {
            conversationId: 'x-dm-thread-1',
            messages: [
              {
                createdAt: new Date('2026-08-01T11:01:00.000Z'),
                messageId: 'x-dm-2',
                senderId: '2244994945',
                senderName: 'Taylor',
                senderUsername: 'taylor',
                text: 'Following up',
              },
            ],
            participantExternalId: '2244994945',
            participantName: 'Taylor',
            participantUsername: 'taylor',
          },
        ],
      });

      await context.service.ingestXDms(scope, { limit: 25 });

      expect(context.twitterService.listDirectMessages).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        { limit: 25 },
        'credential-x',
      );
      expect(
        context.twitterService.listDirectMessages,
      ).not.toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        expect.objectContaining({ paginationToken: 'x-dm-2' }),
        'credential-x',
      );
    });
  });

  describe('ingestLinkedInComments', () => {
    const recordedComments = [
      {
        authorExternalId: 'urn:li:person:abc',
        authorName: 'Taylor',
        commentId: 'urn:li:comment:(urn:li:activity:123,456)',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        text: 'Congrats on the launch',
        threadId: 'urn:li:comment:(urn:li:activity:123,456)',
      },
      {
        authorExternalId: 'urn:li:person:def',
        authorName: 'Jordan',
        commentId: 'urn:li:comment:(urn:li:activity:123,789)',
        createdAt: new Date('2026-08-01T10:01:00.000Z'),
        text: 'When is the waitlist open?',
        threadId: 'urn:li:comment:(urn:li:activity:123,456)',
      },
    ];

    function seedSweep(context: TestContext): void {
      context.prisma.credential.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          externalHandle: 'genfeed',
          externalId: 'urn:li:person:brand',
          externalName: 'Genfeed',
          id: 'credential-li',
          label: 'LinkedIn',
          userId: 'user-1',
          username: 'genfeed',
        },
      ]);
      context.prisma.post.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          description: 'Launch post',
          externalId: 'urn:li:share:123',
          id: 'post-li-1',
          label: 'Launch',
          url: 'https://www.linkedin.com/feed/update/urn:li:share:123',
        },
      ]);
      context.linkedInService.listPostComments.mockResolvedValue(
        recordedComments,
      );
    }

    it('normalizes recorded LinkedIn comments through the shared ingest path', async () => {
      const context = createContext();
      seedSweep(context);

      const result = await context.service.ingestLinkedInComments(
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
        { limit: 50 },
      );

      expect(result).toEqual({ conversationsCreated: 1, messagesCreated: 2 });
      expect(context.conversations[0]).toMatchObject({
        conversationType: SocialConversationType.COMMENT,
        externalConversationId: 'urn:li:comment:(urn:li:activity:123,456)',
        platform: Platform.LINKEDIN,
        postId: 'post-li-1',
        sourceContentId: 'urn:li:share:123',
      });
      expect(context.prisma.credential.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          isConnected: true,
          organizationId: 'org-1',
          platform: PrismaCredentialPlatform.LINKEDIN,
        }),
      });
    });

    it('is idempotent — a second poll of the same comments creates nothing new', async () => {
      const context = createContext();
      seedSweep(context);
      const scope = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };

      await context.service.ingestLinkedInComments(scope, { limit: 50 });
      const second = await context.service.ingestLinkedInComments(scope, {
        limit: 50,
      });

      expect(second).toEqual({ conversationsCreated: 0, messagesCreated: 0 });
      expect(context.messages).toHaveLength(2);
    });

    it('does not ingest from an unconnected LinkedIn account', async () => {
      const context = createContext();
      context.prisma.credential.findMany.mockResolvedValue([]);

      const result = await context.service.ingestLinkedInComments({
        brandId: 'brand-1',
        organizationId: 'org-1',
      });

      expect(result).toEqual({ conversationsCreated: 0, messagesCreated: 0 });
      expect(context.linkedInService.listPostComments).not.toHaveBeenCalled();
    });

    it('keeps the comment start cursor when LinkedIn rate-limits', async () => {
      const context = createContext();
      seedSweep(context);
      const scope = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };

      await context.service.ingestLinkedInComments(scope, { limit: 50 });
      context.linkedInService.listPostComments.mockRejectedValue({
        message: 'Rate limit exceeded',
        status: 429,
      });

      await expect(
        context.service.ingestLinkedInComments(scope, { limit: 50 }),
      ).rejects.toMatchObject({
        cursor: '2',
        isRateLimited: true,
      });
      expect(context.linkedInService.listPostComments).toHaveBeenLastCalledWith(
        'org-1',
        'brand-1',
        'urn:li:share:123',
        { limit: 50, start: 2 },
      );
      expect(context.messages).toHaveLength(2);
    });
  });

  describe('ingestLinkedInDms', () => {
    it('does not ingest when the connected-account path has no mailbox scope', async () => {
      const context = createContext();
      context.prisma.credential.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          id: 'credential-li',
          userId: 'user-1',
        },
      ]);
      context.linkedInService.listDirectMessages.mockResolvedValue({
        isPermitted: false,
        reason: 'LinkedIn messaging is not available on the connected account',
        threads: [
          {
            conversationId: 'should-not-ingest',
            messages: [
              {
                createdAt: new Date(),
                messageId: 'li-dm-1',
                text: 'secret',
              },
            ],
          },
        ],
      });

      const result = await context.service.ingestLinkedInDms({
        brandId: 'brand-1',
        organizationId: 'org-1',
      });

      expect(result).toEqual({ conversationsCreated: 0, messagesCreated: 0 });
      expect(context.messages).toHaveLength(0);
    });

    it('reports an unimplemented mailbox grant instead of a successful empty ingest', async () => {
      const context = createContext();
      context.prisma.credential.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          id: 'credential-li',
          userId: 'user-1',
        },
      ]);
      context.linkedInService.listDirectMessages.mockResolvedValue({
        isImplemented: false,
        isPermitted: true,
        reason: 'LinkedIn mailbox ingestion is not implemented',
        threads: [],
      });

      await expect(
        context.service.ingestLinkedInDms({
          brandId: 'brand-1',
          organizationId: 'org-1',
        }),
      ).rejects.toMatchObject({
        name: SocialInboxProviderError.name,
        platform: Platform.LINKEDIN,
      });
      expect(context.messages).toHaveLength(0);
    });
  });
});
