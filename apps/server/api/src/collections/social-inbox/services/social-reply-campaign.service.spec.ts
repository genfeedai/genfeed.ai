import {
  buildRecipientIdempotencyKey,
  SocialReplyCampaignService,
} from '@api/collections/social-inbox/services/social-reply-campaign.service';
import {
  SocialReplyCampaignRecipientStatus,
  SocialReplyCampaignStatus,
} from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

type StoreCampaign = Record<string, unknown> & {
  dispatchCursor: number;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  status: string;
};

type StoreRecipient = Record<string, unknown> & {
  campaignId: string;
  conversationId: string;
  id: string;
  idempotencyKey: string;
  isDeleted: boolean;
  organizationId: string;
  position: number;
  status: string;
};

type StoreConversation = {
  brandId: string | null;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  platform: string;
};

const SCOPE = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function matchesWhere<T extends Record<string, unknown>>(
  item: T,
  where: Record<string, unknown> = {},
): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) {
      return true;
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const operator = value as Record<string, unknown>;
      if ('in' in operator && Array.isArray(operator.in)) {
        return operator.in.includes(item[key]);
      }
      if ('gte' in operator) {
        const current = item[key];
        return (
          current instanceof Date &&
          current.getTime() >= (operator.gte as Date).getTime()
        );
      }
      if ('not' in operator) {
        return item[key] !== operator.not;
      }
    }

    return item[key] === value;
  });
}

function createContext(): {
  campaigns: StoreCampaign[];
  conversations: StoreConversation[];
  prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    socialReplyCampaign: {
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    socialReplyCampaignRecipient: {
      createMany: ReturnType<typeof vi.fn>;
    };
  };
  workflowQueue: {
    queueSystemWorkflow: ReturnType<typeof vi.fn>;
  };
  recipients: StoreRecipient[];
  service: SocialReplyCampaignService;
} {
  const campaigns: StoreCampaign[] = [];
  const recipients: StoreRecipient[] = [];
  const conversations: StoreConversation[] = [
    {
      brandId: 'brand-1',
      id: 'conversation-1',
      isDeleted: false,
      organizationId: 'org-1',
      platform: 'youtube',
    },
    {
      brandId: 'brand-1',
      id: 'conversation-2',
      isDeleted: false,
      organizationId: 'org-1',
      platform: 'youtube',
    },
    {
      brandId: 'brand-1',
      id: 'conversation-3',
      isDeleted: false,
      organizationId: 'org-1',
      platform: 'instagram',
    },
  ];
  let campaignCounter = 0;
  let recipientCounter = 0;

  const socialReplyCampaign = {
    count: vi
      .fn()
      .mockImplementation(({ where }) =>
        Promise.resolve(
          campaigns.filter((item) => matchesWhere(item, where)).length,
        ),
      ),
    create: vi.fn().mockImplementation(({ data }) => {
      const now = new Date();
      const campaign: StoreCampaign = {
        bodyTemplate: data.bodyTemplate,
        brandId: data.brandId ?? null,
        completedAt: null,
        createdAt: now,
        description: data.description ?? null,
        dispatchCursor: 0,
        failedCount: 0,
        id: `campaign-${++campaignCounter}`,
        isDeleted: false,
        lastDispatchedAt: null,
        lastError: null,
        maxPerDay: data.maxPerDay,
        maxPerHour: data.maxPerHour,
        messageType: data.messageType,
        metadata: {},
        minDelaySeconds: data.minDelaySeconds,
        name: data.name,
        nextRunAt: null,
        organizationId: data.organizationId,
        pausedAt: null,
        platform: data.platform,
        sentCount: 0,
        skippedCount: 0,
        startedAt: null,
        status: data.status,
        totalRecipients: 0,
        updatedAt: now,
        userId: data.userId ?? null,
        workflowExecutionId: null,
        workflowId: null,
      };
      campaigns.push(campaign);
      return Promise.resolve(campaign);
    }),
    findFirst: vi
      .fn()
      .mockImplementation(({ where }) =>
        Promise.resolve(
          campaigns.find((item) => matchesWhere(item, where)) ?? null,
        ),
      ),
    findMany: vi
      .fn()
      .mockImplementation(({ where }) =>
        Promise.resolve(campaigns.filter((item) => matchesWhere(item, where))),
      ),
    update: vi.fn().mockImplementation(({ data, where }) => {
      const campaign = campaigns.find((item) => matchesWhere(item, where));
      if (!campaign) {
        throw new Error('campaign not found');
      }
      Object.assign(campaign, data, { updatedAt: new Date() });
      return Promise.resolve(campaign);
    }),
    updateMany: vi.fn().mockImplementation(({ data, where }) => {
      const matched = campaigns.filter((item) => matchesWhere(item, where));
      for (const campaign of matched) {
        Object.assign(campaign, data, { updatedAt: new Date() });
      }
      return Promise.resolve({ count: matched.length });
    }),
  };

  const socialReplyCampaignRecipient = {
    count: vi
      .fn()
      .mockImplementation(({ where }) =>
        Promise.resolve(
          recipients.filter((item) => matchesWhere(item, where)).length,
        ),
      ),
    createMany: vi.fn().mockImplementation(({ data }) => {
      let count = 0;
      for (const row of data) {
        if (
          recipients.some(
            (item) =>
              item.campaignId === row.campaignId &&
              item.conversationId === row.conversationId,
          )
        ) {
          continue;
        }
        recipients.push({
          attemptCount: 0,
          body: null,
          campaignId: row.campaignId,
          conversationId: row.conversationId,
          createdAt: new Date(),
          dispatchedAt: null,
          failureReason: null,
          id: `recipient-${++recipientCounter}`,
          idempotencyKey: row.idempotencyKey,
          isDeleted: false,
          messageId: null,
          metadata: {},
          organizationId: row.organizationId,
          position: row.position,
          scheduledAt: null,
          sentAt: null,
          status: row.status,
          updatedAt: new Date(),
        });
        count += 1;
      }
      return Promise.resolve({ count });
    }),
    findMany: vi
      .fn()
      .mockImplementation(({ where }) =>
        Promise.resolve(recipients.filter((item) => matchesWhere(item, where))),
      ),
    updateMany: vi.fn().mockImplementation(({ data, where }) => {
      const matched = recipients.filter((item) => matchesWhere(item, where));
      for (const recipient of matched) {
        Object.assign(recipient, data, { updatedAt: new Date() });
      }
      return Promise.resolve({ count: matched.length });
    }),
  };

  const prisma = {
    $transaction: vi
      .fn()
      .mockImplementation(
        async (callback: (tx: typeof prisma) => Promise<unknown>) =>
          callback(prisma),
      ),
    socialConversation: {
      findMany: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            conversations
              .filter((item) => matchesWhere(item, where))
              .map((item) => ({ id: item.id })),
          ),
        ),
    },
    socialReplyCampaign,
    socialReplyCampaignRecipient,
  };

  const workflowQueue = {
    queueSystemWorkflow: vi.fn().mockResolvedValue('job-1'),
  };

  return {
    campaigns,
    conversations,
    prisma,
    workflowQueue,
    recipients,
    service: new SocialReplyCampaignService(
      prisma as never,
      workflowQueue as never,
    ),
  };
}

async function seedCampaign(
  context: ReturnType<typeof createContext>,
  conversationIds: string[] = ['conversation-1', 'conversation-2'],
) {
  return context.service.create(SCOPE, {
    bodyTemplate: 'Hi {{name}}, thanks for watching!',
    conversationIds,
    name: 'Launch follow-up',
    platform: 'youtube',
  });
}

describe('SocialReplyCampaignService', () => {
  describe('create', () => {
    it('materializes recipients in enrollment order with deterministic keys', async () => {
      const context = createContext();

      const campaign = await seedCampaign(context, [
        'conversation-2',
        'conversation-1',
      ]);

      expect(campaign.status).toBe(SocialReplyCampaignStatus.DRAFT);
      expect(campaign.totalRecipients).toBe(2);
      expect(context.recipients.map((row) => row.conversationId)).toEqual([
        'conversation-2',
        'conversation-1',
      ]);
      expect(context.recipients.map((row) => row.position)).toEqual([0, 1]);
      expect(context.recipients[0].idempotencyKey).toBe(
        buildRecipientIdempotencyKey(campaign.id, 'conversation-2'),
      );
      expect(
        context.recipients.every(
          (row) => row.status === SocialReplyCampaignRecipientStatus.PENDING,
        ),
      ).toBe(true);
    });

    it('collapses duplicate conversation ids into one recipient', async () => {
      const context = createContext();

      const campaign = await seedCampaign(context, [
        'conversation-1',
        'conversation-1',
      ]);

      expect(campaign.totalRecipients).toBe(1);
      expect(context.recipients).toHaveLength(1);
    });

    it('rejects conversations that are not on the campaign platform', async () => {
      const context = createContext();

      await expect(
        seedCampaign(context, ['conversation-1', 'conversation-3']),
      ).rejects.toThrow(BadRequestException);
      expect(context.recipients).toHaveLength(0);
    });

    it('rejects a conversation belonging to another tenant', async () => {
      const context = createContext();
      context.conversations.push({
        brandId: 'brand-9',
        id: 'conversation-foreign',
        isDeleted: false,
        organizationId: 'org-2',
        platform: 'youtube',
      });

      await expect(
        seedCampaign(context, ['conversation-foreign']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('transition', () => {
    it('starts a draft by bumping the cursor and enqueuing the first tick', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);

      const started = await context.service.transition(
        SCOPE,
        campaign.id,
        'start',
      );

      expect(started.status).toBe(SocialReplyCampaignStatus.RUNNING);
      expect(started.dispatchCursor).toBe(1);
      expect(started.startedAt).toBeInstanceOf(Date);
      expect(context.workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          inputValues: {
            request: {
              campaignId: campaign.id,
              dispatchCursor: 1,
              organizationId: 'org-1',
            },
          },
        }),
        `social-reply-campaign-${campaign.id}-1`,
        { replaceTerminalJob: true },
      );
    });

    it('refuses to start a campaign with no pending recipients', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);
      for (const recipient of context.recipients) {
        recipient.status = SocialReplyCampaignRecipientStatus.SENT;
      }

      await expect(
        context.service.transition(SCOPE, campaign.id, 'start'),
      ).rejects.toThrow('Campaign has no pending recipients to dispatch');
      expect(context.workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
    });

    it('refuses to start an already-running campaign', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);
      await context.service.transition(SCOPE, campaign.id, 'start');

      await expect(
        context.service.transition(SCOPE, campaign.id, 'start'),
      ).rejects.toThrow(BadRequestException);
    });

    it('pauses a running campaign so its already queued workflow becomes stale', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);
      await context.service.transition(SCOPE, campaign.id, 'start');

      const paused = await context.service.transition(
        SCOPE,
        campaign.id,
        'pause',
      );

      expect(paused.status).toBe(SocialReplyCampaignStatus.PAUSED);
      expect(paused.nextRunAt).toBeNull();
      expect(context.workflowQueue.queueSystemWorkflow).toHaveBeenCalledTimes(
        1,
      );
    });

    it('resumes from pause on a fresh cursor so the orphaned tick stays stale', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);
      await context.service.transition(SCOPE, campaign.id, 'start');
      await context.service.transition(SCOPE, campaign.id, 'pause');

      const resumed = await context.service.transition(
        SCOPE,
        campaign.id,
        'resume',
      );

      expect(resumed.status).toBe(SocialReplyCampaignStatus.RUNNING);
      expect(resumed.dispatchCursor).toBe(2);
      expect(resumed.pausedAt).toBeNull();
      expect(
        context.workflowQueue.queueSystemWorkflow,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({
          inputValues: {
            request: {
              campaignId: campaign.id,
              dispatchCursor: 2,
              organizationId: 'org-1',
            },
          },
        }),
        `social-reply-campaign-${campaign.id}-2`,
        { replaceTerminalJob: true },
      );
    });

    it('cannot resume a campaign that was never paused', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);

      await expect(
        context.service.transition(SCOPE, campaign.id, 'resume'),
      ).rejects.toThrow(BadRequestException);
    });

    it('cancels a campaign and releases every undelivered recipient', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);
      await context.service.transition(SCOPE, campaign.id, 'start');
      context.recipients[0].status = SocialReplyCampaignRecipientStatus.SENT;

      const cancelled = await context.service.transition(
        SCOPE,
        campaign.id,
        'cancel',
      );

      expect(cancelled.status).toBe(SocialReplyCampaignStatus.CANCELLED);
      expect(cancelled.completedAt).toBeInstanceOf(Date);
      expect(context.recipients.map((row) => row.status)).toEqual([
        SocialReplyCampaignRecipientStatus.SENT,
        SocialReplyCampaignRecipientStatus.CANCELLED,
      ]);
    });

    it('rejects a second cancel of a terminal campaign', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);
      await context.service.transition(SCOPE, campaign.id, 'cancel');

      await expect(
        context.service.transition(SCOPE, campaign.id, 'cancel'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lets only one concurrent start win the cursor and enqueue', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);

      const [first, second] = await Promise.allSettled([
        context.service.transition(SCOPE, campaign.id, 'start'),
        context.service.transition(SCOPE, campaign.id, 'start'),
      ]);

      const fulfilled = [first, second].filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = [first, second].filter(
        (result) => result.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(context.workflowQueue.queueSystemWorkflow).toHaveBeenCalledTimes(
        1,
      );
      expect(context.campaigns[0]).toMatchObject({
        dispatchCursor: 1,
        status: SocialReplyCampaignStatus.RUNNING,
      });
    });

    it('identifies resume when a concurrent resume loses the activation claim', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);
      await context.service.transition(SCOPE, campaign.id, 'start');
      await context.service.transition(SCOPE, campaign.id, 'pause');

      const results = await Promise.allSettled([
        context.service.transition(SCOPE, campaign.id, 'resume'),
        context.service.transition(SCOPE, campaign.id, 'resume'),
      ]);
      const rejected = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      if (!rejected) {
        throw new Error('Expected one concurrent resume to be rejected');
      }

      expect(rejected.reason).toBeInstanceOf(BadRequestException);
      expect((rejected.reason as BadRequestException).message).toBe(
        'Cannot resume a paused campaign',
      );
    });
  });

  describe('create atomicity', () => {
    it('rolls back the campaign when recipient enrollment fails', async () => {
      const context = createContext();

      context.prisma.$transaction.mockImplementationOnce(
        async (callback: (tx: typeof context.prisma) => Promise<unknown>) => {
          try {
            return await callback(context.prisma);
          } catch (error) {
            // Simulate transactional rollback: drop anything the callback wrote.
            context.campaigns.length = 0;
            context.recipients.length = 0;
            throw error;
          }
        },
      );
      context.prisma.socialReplyCampaignRecipient.createMany.mockImplementationOnce(
        () => {
          throw new Error('enrollment failed');
        },
      );

      await expect(seedCampaign(context, ['conversation-1'])).rejects.toThrow(
        'enrollment failed',
      );
      expect(context.campaigns).toHaveLength(0);
      expect(context.recipients).toHaveLength(0);
    });
  });

  describe('patch', () => {
    it('updates copy and rate limits on a live campaign', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);

      const patched = await context.service.patch(SCOPE, campaign.id, {
        bodyTemplate: '  Updated   <strong>body</strong>  ',
        maxPerHour: 3,
        minDelaySeconds: 120,
      });

      expect(patched.bodyTemplate).toBe('Updated body');
      expect(patched.maxPerHour).toBe(3);
      expect(patched.minDelaySeconds).toBe(120);
    });

    it('refuses to edit a cancelled campaign', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);
      await context.service.transition(SCOPE, campaign.id, 'cancel');

      await expect(
        context.service.patch(SCOPE, campaign.id, { name: 'Renamed' }),
      ).rejects.toThrow('can no longer be edited');
    });
  });

  describe('remove', () => {
    it('cancels before soft-deleting the campaign and its recipients', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);
      await context.service.transition(SCOPE, campaign.id, 'start');

      const removed = await context.service.remove(SCOPE, campaign.id);

      expect(removed.isDeleted).toBe(true);
      expect(removed.status).toBe(SocialReplyCampaignStatus.CANCELLED);
      expect(context.recipients.every((row) => row.isDeleted)).toBe(true);
    });
  });

  describe('reads', () => {
    it('hides another tenant’s campaign from get', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context);

      await expect(
        context.service.get({ ...SCOPE, organizationId: 'org-2' }, campaign.id),
      ).rejects.toThrow();
    });

    it('lists recipients in drain order', async () => {
      const context = createContext();
      const campaign = await seedCampaign(context, [
        'conversation-2',
        'conversation-1',
      ]);

      const page = await context.service.listRecipients(SCOPE, campaign.id, {});

      expect(page.total).toBe(2);
      expect(page.docs.map((doc) => doc.conversationId)).toEqual([
        'conversation-2',
        'conversation-1',
      ]);
      expect(page.docs[0].campaignId).toBe(campaign.id);
    });

    it('scopes the list query to the organization', async () => {
      const context = createContext();
      await seedCampaign(context);

      const page = await context.service.list(SCOPE, {});
      const otherTenant = await context.service.list(
        { ...SCOPE, organizationId: 'org-2' },
        {},
      );

      expect(page.total).toBe(1);
      expect(otherTenant.total).toBe(0);
    });
  });
});
