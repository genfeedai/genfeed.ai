import { SocialReplyCampaignDispatchService } from '@api/collections/social-inbox/services/social-reply-campaign-dispatch.service';
import {
  SocialMessageType,
  SocialReplyCampaignRecipientStatus,
  SocialReplyCampaignStatus,
} from '@genfeedai/enums';
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
  isDeleted: boolean;
  organizationId: string;
  position: number;
  sentAt: Date | null;
  status: string;
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
    }

    return item[key] === value;
  });
}

function applyData(
  target: Record<string, unknown>,
  data: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(data)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      'increment' in (value as Record<string, unknown>)
    ) {
      const increment = (value as { increment: number }).increment;
      target[key] = Number(target[key] ?? 0) + increment;
      continue;
    }
    target[key] = value;
  }
  target.updatedAt = new Date();
}

function createCampaign(overrides: Partial<StoreCampaign> = {}): StoreCampaign {
  return {
    bodyTemplate: 'Hi {{name}}, thanks!',
    brandId: 'brand-1',
    dispatchCursor: 1,
    failedCount: 0,
    id: 'campaign-1',
    isDeleted: false,
    lastDispatchedAt: null,
    lastError: null,
    maxPerDay: 50,
    maxPerHour: 10,
    messageType: SocialMessageType.REPLY,
    minDelaySeconds: 60,
    organizationId: 'org-1',
    platform: 'youtube',
    sentCount: 0,
    skippedCount: 0,
    status: SocialReplyCampaignStatus.RUNNING,
    userId: 'user-1',
    ...overrides,
  };
}

function createRecipient(
  overrides: Partial<StoreRecipient> = {},
): StoreRecipient {
  return {
    attemptCount: 0,
    body: null,
    campaignId: 'campaign-1',
    conversationId: 'conversation-1',
    failureReason: null,
    id: 'recipient-1',
    idempotencyKey: 'reply-campaign:campaign-1:conversation-1',
    isDeleted: false,
    messageId: null,
    organizationId: 'org-1',
    position: 0,
    sentAt: null,
    status: SocialReplyCampaignRecipientStatus.PENDING,
    ...overrides,
  };
}

function createContext(options: {
  campaign?: Partial<StoreCampaign>;
  recipients?: StoreRecipient[];
}) {
  const campaigns: StoreCampaign[] = [createCampaign(options.campaign)];
  const recipients: StoreRecipient[] = options.recipients ?? [
    createRecipient(),
  ];
  const conversations = [
    {
      id: 'conversation-1',
      isDeleted: false,
      organizationId: 'org-1',
      participantHandle: '@taylor',
      participantName: 'Taylor',
      platform: 'youtube',
    },
  ];

  const prisma = {
    socialConversation: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            conversations.find((item) => matchesWhere(item, where)) ?? null,
          ),
        ),
    },
    socialReplyCampaign: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            campaigns.find((item) => matchesWhere(item, where)) ?? null,
          ),
        ),
      update: vi.fn().mockImplementation(({ data, where }) => {
        const campaign = campaigns.find((item) => matchesWhere(item, where));
        if (!campaign) {
          throw new Error('campaign not found');
        }
        applyData(campaign, data);
        return Promise.resolve(campaign);
      }),
      updateMany: vi.fn().mockImplementation(({ data, where }) => {
        const matched = campaigns.filter((item) => matchesWhere(item, where));
        for (const campaign of matched) {
          applyData(campaign, data);
        }
        return Promise.resolve({ count: matched.length });
      }),
    },
    socialReplyCampaignRecipient: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            [...recipients]
              .sort((left, right) => left.position - right.position)
              .find((item) => matchesWhere(item, where)) ?? null,
          ),
        ),
      findMany: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            recipients
              .filter((item) => matchesWhere(item, where))
              .sort(
                (left, right) =>
                  (left.sentAt?.getTime() ?? 0) -
                  (right.sentAt?.getTime() ?? 0),
              ),
          ),
        ),
      updateMany: vi.fn().mockImplementation(({ data, where }) => {
        const matched = recipients.filter((item) => matchesWhere(item, where));
        for (const recipient of matched) {
          applyData(recipient, data);
        }
        return Promise.resolve({ count: matched.length });
      }),
    },
  };

  const actionService = {
    postReply: vi.fn().mockResolvedValue({ id: 'message-1' }),
    sendDm: vi.fn().mockResolvedValue({ id: 'dm-message-1' }),
  };
  const queueService = {
    enqueueTick: vi.fn().mockResolvedValue('job-1'),
    removeTick: vi.fn().mockResolvedValue(undefined),
  };
  const provenanceService = {
    runAction: vi
      .fn()
      .mockImplementation(
        async (
          _input: unknown,
          action: (provenance: {
            executionId: string;
            workflowId: string;
            workflowLabel: string;
          }) => Promise<unknown>,
        ) => ({
          result: await action({
            executionId: 'execution-1',
            workflowId: 'workflow-1',
            workflowLabel: 'Inbox Reply Campaign Dispatch',
          }),
        }),
      ),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  return {
    actionService,
    campaigns,
    conversations,
    prisma,
    provenanceService,
    queueService,
    recipients,
    service: new SocialReplyCampaignDispatchService(
      prisma as never,
      actionService as never,
      queueService as never,
      provenanceService as never,
      logger as never,
    ),
  };
}

const TICK = {
  campaignId: 'campaign-1',
  dispatchCursor: 1,
  organizationId: 'org-1',
};

describe('SocialReplyCampaignDispatchService', () => {
  describe('staleness gate', () => {
    it('no-ops when the campaign is paused', async () => {
      const context = createContext({
        campaign: { status: SocialReplyCampaignStatus.PAUSED },
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result).toEqual({ outcome: 'campaign-inactive' });
      expect(context.actionService.postReply).not.toHaveBeenCalled();
      expect(context.queueService.enqueueTick).not.toHaveBeenCalled();
    });

    it('no-ops when a resume already moved the cursor past this tick', async () => {
      const context = createContext({ campaign: { dispatchCursor: 4 } });

      const result = await context.service.dispatchTick(TICK);

      expect(result).toEqual({ outcome: 'campaign-inactive' });
      expect(context.actionService.postReply).not.toHaveBeenCalled();
    });

    it('no-ops for a campaign owned by another tenant', async () => {
      const context = createContext({});

      const result = await context.service.dispatchTick({
        ...TICK,
        organizationId: 'org-2',
      });

      expect(result).toEqual({ outcome: 'campaign-inactive' });
    });
  });

  describe('sending', () => {
    it('posts one reply, marks the recipient sent, and paces the next tick', async () => {
      const context = createContext({});

      const result = await context.service.dispatchTick(TICK);

      expect(result).toEqual({
        outcome: 'recipient-sent',
        recipientId: 'recipient-1',
      });
      expect(context.actionService.postReply).toHaveBeenCalledTimes(1);
      expect(context.actionService.postReply).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          organizationId: 'org-1',
          userId: 'user-1',
        },
        'conversation-1',
        {
          idempotencyKey: 'reply-campaign:campaign-1:conversation-1',
          text: 'Hi Taylor, thanks!',
          workflowRunId: 'execution-1',
        },
      );
      expect(context.recipients[0]).toMatchObject({
        attemptCount: 1,
        body: 'Hi Taylor, thanks!',
        messageId: 'message-1',
        status: SocialReplyCampaignRecipientStatus.SENT,
      });
      expect(context.campaigns[0]).toMatchObject({
        dispatchCursor: 2,
        sentCount: 1,
      });
      expect(context.queueService.enqueueTick).toHaveBeenCalledWith(
        {
          campaignId: 'campaign-1',
          dispatchCursor: 2,
          organizationId: 'org-1',
        },
        60,
      );
    });

    it('routes a DM campaign through sendDm instead of postReply', async () => {
      const context = createContext({
        campaign: { messageType: SocialMessageType.DM },
      });

      await context.service.dispatchTick(TICK);

      expect(context.actionService.sendDm).toHaveBeenCalledTimes(1);
      expect(context.actionService.postReply).not.toHaveBeenCalled();
    });

    it('records the dispatch as a system workflow action run', async () => {
      const context = createContext({});

      await context.service.dispatchTick(TICK);

      expect(context.provenanceService.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'social-reply-campaign',
          canonicalId: 'social-reply-campaign',
          inputValues: expect.objectContaining({
            campaignId: 'campaign-1',
            conversationId: 'conversation-1',
            recipientId: 'recipient-1',
          }),
          organizationId: 'org-1',
        }),
        expect.any(Function),
      );
    });

    it('drains recipients in position order', async () => {
      const context = createContext({
        recipients: [
          createRecipient({
            conversationId: 'conversation-1',
            id: 'recipient-late',
            position: 5,
          }),
          createRecipient({
            conversationId: 'conversation-1',
            id: 'recipient-early',
            position: 1,
          }),
        ],
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result.recipientId).toBe('recipient-early');
    });
  });

  describe('throttling', () => {
    it('reschedules without sending when the minimum delay has not elapsed', async () => {
      const context = createContext({
        recipients: [
          createRecipient({
            id: 'recipient-sent',
            position: 0,
            sentAt: new Date(Date.now() - 10_000),
            status: SocialReplyCampaignRecipientStatus.SENT,
          }),
          createRecipient({ id: 'recipient-next', position: 1 }),
        ],
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result.outcome).toBe('throttled');
      expect(result.nextRunInSeconds).toBeGreaterThan(0);
      expect(context.actionService.postReply).not.toHaveBeenCalled();
      expect(context.queueService.enqueueTick).toHaveBeenCalledWith(
        {
          campaignId: 'campaign-1',
          dispatchCursor: 2,
          organizationId: 'org-1',
        },
        result.nextRunInSeconds,
      );
    });

    it('holds the campaign when the hourly ceiling is spent', async () => {
      const sent = Array.from({ length: 2 }, (_value, index) =>
        createRecipient({
          id: `recipient-sent-${index}`,
          position: index,
          sentAt: new Date(Date.now() - (30 + index) * 60_000),
          status: SocialReplyCampaignRecipientStatus.SENT,
        }),
      );
      const context = createContext({
        campaign: { maxPerHour: 2 },
        recipients: [...sent, createRecipient({ id: 'pending', position: 9 })],
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result.outcome).toBe('throttled');
      expect(context.actionService.postReply).not.toHaveBeenCalled();
    });
  });

  describe('completion', () => {
    it('completes the campaign when nothing is left to claim', async () => {
      const context = createContext({
        recipients: [
          createRecipient({
            sentAt: new Date(Date.now() - 2 * 60 * 60_000),
            status: SocialReplyCampaignRecipientStatus.SENT,
          }),
        ],
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result).toEqual({ outcome: 'campaign-completed' });
      expect(context.campaigns[0]).toMatchObject({
        nextRunAt: null,
        status: SocialReplyCampaignStatus.COMPLETED,
      });
      expect(context.queueService.enqueueTick).not.toHaveBeenCalled();
    });
  });

  describe('failure handling', () => {
    it('skips a permanently unsendable recipient and keeps draining immediately', async () => {
      const context = createContext({
        recipients: [
          createRecipient({ id: 'recipient-1', position: 0 }),
          createRecipient({ id: 'recipient-2', position: 1 }),
        ],
      });
      context.actionService.postReply.mockRejectedValueOnce(
        new BadRequestException('DMs are not supported on youtube'),
      );

      const result = await context.service.dispatchTick(TICK);

      expect(result).toEqual({
        outcome: 'recipient-skipped',
        recipientId: 'recipient-1',
      });
      expect(context.recipients[0]).toMatchObject({
        failureReason: 'DMs are not supported on youtube',
        status: SocialReplyCampaignRecipientStatus.SKIPPED,
      });
      expect(context.campaigns[0].skippedCount).toBe(1);
      // No cooldown for a skip — nothing was actually sent.
      expect(context.queueService.enqueueTick).toHaveBeenCalledWith(
        {
          campaignId: 'campaign-1',
          dispatchCursor: 2,
          organizationId: 'org-1',
        },
        0,
      );
    });

    it('fails a recipient on a transient provider error and backs off', async () => {
      const context = createContext({});
      context.actionService.postReply.mockRejectedValueOnce(
        new Error('provider unavailable'),
      );

      const result = await context.service.dispatchTick(TICK);

      expect(result).toEqual({
        outcome: 'recipient-failed',
        recipientId: 'recipient-1',
      });
      expect(context.recipients[0]).toMatchObject({
        failureReason: 'provider unavailable',
        status: SocialReplyCampaignRecipientStatus.FAILED,
      });
      expect(context.campaigns[0]).toMatchObject({
        failedCount: 1,
        lastError: 'provider unavailable',
      });
      expect(context.queueService.enqueueTick).toHaveBeenCalledWith(
        {
          campaignId: 'campaign-1',
          dispatchCursor: 2,
          organizationId: 'org-1',
        },
        60,
      );
    });

    it('skips a recipient whose conversation disappeared', async () => {
      const context = createContext({
        recipients: [createRecipient({ conversationId: 'conversation-gone' })],
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result).toEqual({
        outcome: 'recipient-skipped',
        recipientId: 'recipient-1',
      });
      expect(context.actionService.postReply).not.toHaveBeenCalled();
      expect(context.recipients[0].status).toBe(
        SocialReplyCampaignRecipientStatus.SKIPPED,
      );
    });
  });

  describe('claiming', () => {
    it('lets only one of two concurrent ticks claim the same recipient', async () => {
      const context = createContext({});

      const [first, second] = await Promise.all([
        context.service.dispatchTick(TICK),
        context.service.dispatchTick(TICK),
      ]);

      const sent = [first, second].filter(
        (result) => result.outcome === 'recipient-sent',
      );
      expect(sent).toHaveLength(1);
      expect(context.actionService.postReply).toHaveBeenCalledTimes(1);
    });

    it('stops scheduling when a pause lands mid-tick', async () => {
      const context = createContext({});
      context.actionService.postReply.mockImplementationOnce(async () => {
        context.campaigns[0].status = SocialReplyCampaignStatus.PAUSED;
        return { id: 'message-1' };
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result.outcome).toBe('recipient-sent');
      expect(context.queueService.enqueueTick).not.toHaveBeenCalled();
      expect(context.campaigns[0].dispatchCursor).toBe(1);
    });
  });
});
