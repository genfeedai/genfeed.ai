import { SOCIAL_INBOX_OUTBOUND_ACTION_IDS } from '@api/collections/social-inbox/services/social-inbox-outbound-workflow-definition';
import {
  SOCIAL_REPLY_CAMPAIGN_DISPATCH_STALE_MS,
  SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS,
  SocialReplyCampaignDispatchService,
} from '@api/collections/social-inbox/services/social-reply-campaign-dispatch.service';
import { buildSocialReplyCampaignWorkflowDefinition } from '@api/collections/social-inbox/services/social-reply-campaign-workflow-definition';
import { createSystemWorkflowRunnerMock } from '@api/shared/testing/system-workflow-runner-mock';
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

/**
 * Ordered comparison over the two column types these filters touch. Returns
 * null for anything unorderable — including a null/undefined column, which is
 * how Prisma treats a null against `gte`/`lt`.
 */
function compareValues(current: unknown, bound: unknown): number | null {
  if (current instanceof Date && bound instanceof Date) {
    return current.getTime() - bound.getTime();
  }
  if (typeof current === 'number' && typeof bound === 'number') {
    return current - bound;
  }
  return null;
}

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
        const delta = compareValues(item[key], operator.gte);
        return delta !== null && delta >= 0;
      }
      if ('lt' in operator) {
        const delta = compareValues(item[key], operator.lt);
        return delta !== null && delta < 0;
      }
    }

    // Prisma compares timestamp columns by value; the dispatch graph carries
    // `dispatchedAt` across actions as an ISO string, so the claim instant
    // arrives back here as a fresh Date object.
    const current = item[key];
    if (current instanceof Date && value instanceof Date) {
      return current.getTime() === value.getTime();
    }

    return current === value;
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
    $transaction: vi.fn(),
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
      count: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            recipients.filter((item) => matchesWhere(item, where)).length,
          ),
        ),
      findFirst: vi.fn().mockImplementation(({ where, orderBy }) => {
        const sorted = [...recipients].sort((left, right) => {
          if (Array.isArray(orderBy)) {
            for (const clause of orderBy) {
              const key = Object.keys(clause)[0] as keyof StoreRecipient;
              const direction = clause[key] === 'desc' ? -1 : 1;
              const leftValue = left[key];
              const rightValue = right[key];
              if (leftValue === rightValue) {
                continue;
              }
              if (
                typeof leftValue === 'number' &&
                typeof rightValue === 'number'
              ) {
                return (leftValue - rightValue) * direction;
              }
              return (
                String(leftValue).localeCompare(String(rightValue)) * direction
              );
            }
            return 0;
          }
          return left.position - right.position;
        });
        return Promise.resolve(
          sorted.find((item) => matchesWhere(item, where)) ?? null,
        );
      }),
      findMany: vi.fn().mockImplementation(({ where, orderBy }) => {
        let rows = recipients.filter((item) => matchesWhere(item, where));
        if (orderBy && typeof orderBy === 'object' && 'sentAt' in orderBy) {
          const direction = orderBy.sentAt === 'desc' ? -1 : 1;
          rows = [...rows].sort(
            (left, right) =>
              ((left.sentAt?.getTime() ?? 0) - (right.sentAt?.getTime() ?? 0)) *
              direction,
          );
        }
        return Promise.resolve(rows);
      }),
      updateMany: vi.fn().mockImplementation(({ data, where }) => {
        const matched = recipients.filter((item) => matchesWhere(item, where));
        for (const recipient of matched) {
          applyData(recipient, data);
        }
        return Promise.resolve({ count: matched.length });
      }),
    },
  };

  prisma.$transaction.mockImplementation(
    async (callback: (transaction: typeof prisma) => Promise<unknown>) => {
      const campaignSnapshot = campaigns.map((campaign) => ({ ...campaign }));
      const recipientSnapshot = recipients.map((recipient) => ({
        ...recipient,
      }));
      try {
        return await callback(prisma);
      } catch (error: unknown) {
        campaigns.splice(0, campaigns.length, ...campaignSnapshot);
        recipients.splice(0, recipients.length, ...recipientSnapshot);
        throw error;
      }
    },
  );

  const actionService = {
    postReply: vi.fn().mockResolvedValue({ id: 'message-1' }),
    sendDm: vi.fn().mockResolvedValue({ id: 'dm-message-1' }),
  };
  const workflowQueue = {
    queueSystemWorkflow: vi.fn().mockResolvedValue('job-1'),
  };
  const actionExecutors = new Map<
    string,
    (request: Record<string, unknown>) => Promise<unknown>
  >();
  actionExecutors.set(
    SOCIAL_INBOX_OUTBOUND_ACTION_IDS.RESERVE,
    async (request) =>
      (request.input as Record<string, unknown>).state as Record<
        string,
        unknown
      >,
  );
  actionExecutors.set(
    SOCIAL_INBOX_OUTBOUND_ACTION_IDS.PROVIDER,
    async (request) => {
      const input = request.input as Record<string, unknown>;
      const state = input.state as Record<string, unknown>;
      if (state.outcome) return state;
      const scope = {
        brandId: 'brand-1',
        organizationId: state.organizationId,
        userId: state.userId,
      };
      try {
        const message =
          state.messageType === 'dm'
            ? await actionService.sendDm(scope, state.conversationId, {
                idempotencyKey: state.idempotencyKey,
                text: state.body,
                workflowRunId: state.workflowRunId,
              })
            : await actionService.postReply(scope, state.conversationId, {
                idempotencyKey: state.idempotencyKey,
                text: state.body,
                workflowRunId: state.workflowRunId,
              });
        return { ...state, outboundMessageId: message.id };
      } catch (error: unknown) {
        return {
          ...state,
          error: error instanceof Error ? error.message : 'Dispatch failed',
          errorKind:
            error instanceof BadRequestException ? 'bad-request' : 'provider',
        };
      }
    },
  );
  actionExecutors.set(
    SOCIAL_INBOX_OUTBOUND_ACTION_IDS.FINALIZE,
    async (request) =>
      (request.input as Record<string, unknown>).state as Record<
        string,
        unknown
      >,
  );
  const provenanceService = createSystemWorkflowRunnerMock({
    definitions: [buildSocialReplyCampaignWorkflowDefinition()],
  });
  for (const [actionId, executor] of actionExecutors) {
    provenanceService.registerAction(actionId, executor as never);
  }
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const service = new SocialReplyCampaignDispatchService(
    prisma as never,
    workflowQueue as never,
    provenanceService as never,
    logger as never,
  );
  service.onModuleInit();

  return {
    actionService,
    campaigns,
    conversations,
    prisma,
    provenanceService,
    workflowQueue,
    recipients,
    service,
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
      expect(context.workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
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
      expect(context.workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalId: 'social.reply-campaign.dispatch-tick',
          inputValues: {
            request: {
              campaignId: 'campaign-1',
              dispatchCursor: 2,
              organizationId: 'org-1',
            },
          },
        }),
        'social-reply-campaign-campaign-1-2',
        expect.objectContaining({ delayMs: 60_000 }),
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

    it('records the dispatch as a multi-action system workflow run', async () => {
      const context = createContext({});

      await context.service.dispatchTick(TICK);

      expect(context.provenanceService.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalId: 'social.reply-campaign.dispatch-tick',
          inputValues: { request: TICK },
          organizationId: 'org-1',
        }),
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

      expect(result.outcome).toBe('recipient-sent');
      expect(result.recipientId).toBe('recipient-early');
      expect(
        context.prisma.socialReplyCampaignRecipient.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        }),
      );
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
      expect(context.workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
        expect.anything(),
        'social-reply-campaign-campaign-1-2',
        expect.objectContaining({
          delayMs: (result.nextRunInSeconds ?? 0) * 1000,
        }),
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
      expect(context.workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
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
      expect(context.workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
        expect.anything(),
        'social-reply-campaign-campaign-1-2',
        expect.objectContaining({ delayMs: 0 }),
      );
    });

    it('requeues a recipient on a transient provider error under the attempt budget', async () => {
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
        attemptCount: 1,
        failureReason: 'provider unavailable',
        // Still drainable — a first 5xx must not permanently retire the row.
        status: SocialReplyCampaignRecipientStatus.PENDING,
      });
      expect(context.campaigns[0]).toMatchObject({
        failedCount: 0,
        lastError: 'provider unavailable',
      });
      expect(context.workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
        expect.anything(),
        'social-reply-campaign-campaign-1-2',
        expect.objectContaining({ delayMs: 60_000 }),
      );
    });

    it('permanently fails a recipient once the attempt budget is exhausted', async () => {
      const context = createContext({
        recipients: [
          createRecipient({
            attemptCount: SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS - 1,
          }),
        ],
      });
      context.actionService.postReply.mockRejectedValueOnce(
        new Error('provider unavailable'),
      );

      const result = await context.service.dispatchTick(TICK);

      expect(result).toEqual({
        outcome: 'recipient-failed',
        recipientId: 'recipient-1',
      });
      expect(context.recipients[0]).toMatchObject({
        attemptCount: SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS,
        failureReason: 'provider unavailable',
        status: SocialReplyCampaignRecipientStatus.FAILED,
      });
      expect(context.campaigns[0]).toMatchObject({
        failedCount: 1,
        lastError: 'provider unavailable',
      });
    });

    it('skips a recipient whose conversation disappeared', async () => {
      const context = createContext({
        recipients: [createRecipient({ conversationId: 'conversation-gone' })],
      });

      const result = await context.service.dispatchTick(TICK);

      // Nothing was sent, so the successor tick keeps draining immediately.
      expect(result).toEqual({
        nextRunInSeconds: 0,
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
      // The loser must re-tick rather than complete the campaign early.
      expect(context.campaigns[0].status).toBe(
        SocialReplyCampaignStatus.RUNNING,
      );
      expect(
        [first, second].some(
          (result) => result.outcome === 'recipient-skipped',
        ),
      ).toBe(true);
    });

    it('does not complete the campaign on a lost claim race with remaining pending rows', async () => {
      const context = createContext({
        recipients: [
          createRecipient({ id: 'recipient-1', position: 0 }),
          createRecipient({
            conversationId: 'conversation-1',
            id: 'recipient-2',
            position: 1,
          }),
        ],
      });

      // First claim wins; force a second claim against the same first candidate
      // by simulating a concurrent update that already moved it out of PENDING.
      let claimAttempts = 0;
      const originalUpdateMany =
        context.prisma.socialReplyCampaignRecipient.updateMany;
      context.prisma.socialReplyCampaignRecipient.updateMany = vi
        .fn()
        .mockImplementation(async (args) => {
          // Count claims, not writes: the stale-dispatch sweep also runs
          // updateMany, and a positional counter would land on the sweep.
          const isClaim =
            args.where?.status === SocialReplyCampaignRecipientStatus.PENDING &&
            args.data?.status ===
              SocialReplyCampaignRecipientStatus.DISPATCHING;

          if (!isClaim) {
            return originalUpdateMany(args);
          }

          claimAttempts += 1;
          if (claimAttempts === 1) {
            // Lose the race: another worker claimed this candidate first.
            return { count: 0 };
          }
          return originalUpdateMany(args);
        });

      const result = await context.service.dispatchTick(TICK);

      expect(result.outcome).toBe('recipient-skipped');
      expect(context.campaigns[0].status).toBe(
        SocialReplyCampaignStatus.RUNNING,
      );
      expect(
        context.recipients.every(
          (row) => row.status !== SocialReplyCampaignRecipientStatus.SENT,
        ),
      ).toBe(true);
      expect(context.workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
        expect.anything(),
        'social-reply-campaign-campaign-1-2',
        expect.objectContaining({ delayMs: 0 }),
      );
    });

    it('stops scheduling when a pause lands mid-tick', async () => {
      const context = createContext({});
      context.actionService.postReply.mockImplementationOnce(async () => {
        context.campaigns[0].status = SocialReplyCampaignStatus.PAUSED;
        return { id: 'message-1' };
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result.outcome).toBe('recipient-sent');
      expect(context.workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
      expect(context.campaigns[0].dispatchCursor).toBe(1);
    });

    it('does not let a stale worker settle a later recipient claim', async () => {
      const context = createContext({});
      const laterClaimStartedAt = new Date(Date.now() + 1_000);
      context.actionService.postReply.mockImplementationOnce(async () => {
        Object.assign(context.recipients[0], {
          dispatchedAt: laterClaimStartedAt,
          status: SocialReplyCampaignRecipientStatus.DISPATCHING,
        });
        return { id: 'message-from-stale-worker' };
      });

      await context.service.dispatchTick(TICK);

      expect(context.recipients[0]).toMatchObject({
        dispatchedAt: laterClaimStartedAt,
        messageId: null,
        status: SocialReplyCampaignRecipientStatus.DISPATCHING,
      });
      expect(context.campaigns[0].sentCount).toBe(0);
    });

    it('defers completion while a concurrent tick still holds DISPATCHING', async () => {
      const context = createContext({
        recipients: [
          createRecipient({
            dispatchedAt: new Date(),
            id: 'recipient-in-flight',
            status: SocialReplyCampaignRecipientStatus.DISPATCHING,
          }),
        ],
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result.outcome).toBe('throttled');
      expect(context.campaigns[0].status).toBe(
        SocialReplyCampaignStatus.RUNNING,
      );
      expect(context.workflowQueue.queueSystemWorkflow).toHaveBeenCalled();
    });
  });

  describe('stale dispatch reclaim', () => {
    const now = new Date('2026-08-05T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function staleAt(): Date {
      return new Date(
        Date.now() - SOCIAL_REPLY_CAMPAIGN_DISPATCH_STALE_MS - 60_000,
      );
    }

    it('returns an abandoned claim to the queue and sends it in the same tick', async () => {
      const context = createContext({
        recipients: [
          createRecipient({
            attemptCount: 1,
            dispatchedAt: staleAt(),
            id: 'recipient-abandoned',
            status: SocialReplyCampaignRecipientStatus.DISPATCHING,
          }),
        ],
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result).toEqual({
        outcome: 'recipient-sent',
        recipientId: 'recipient-abandoned',
      });
      expect(context.recipients[0]).toMatchObject({
        attemptCount: 2,
        status: SocialReplyCampaignRecipientStatus.SENT,
      });
    });

    it('retires an abandoned claim whose attempt budget is already spent', async () => {
      const context = createContext({
        recipients: [
          createRecipient({
            attemptCount: SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS,
            dispatchedAt: staleAt(),
            id: 'recipient-exhausted',
            status: SocialReplyCampaignRecipientStatus.DISPATCHING,
          }),
        ],
      });

      const result = await context.service.dispatchTick(TICK);

      // Reclaimed, retired, and the campaign is then free to finish instead of
      // rescheduling against a permanently in-flight row.
      expect(result).toEqual({ outcome: 'campaign-completed' });
      expect(context.recipients[0]).toMatchObject({
        attemptCount: SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS,
        status: SocialReplyCampaignRecipientStatus.FAILED,
      });
      expect(context.campaigns[0].failedCount).toBe(1);
    });

    it('rolls back recipient retirement when the campaign aggregate write fails', async () => {
      const context = createContext({
        recipients: [
          createRecipient({
            attemptCount: SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS,
            dispatchedAt: staleAt(),
            id: 'recipient-exhausted',
            status: SocialReplyCampaignRecipientStatus.DISPATCHING,
          }),
        ],
      });
      context.prisma.socialReplyCampaign.updateMany.mockImplementationOnce(
        () => {
          throw new Error('campaign aggregate unavailable');
        },
      );

      await expect(context.service.dispatchTick(TICK)).rejects.toThrow(
        'campaign aggregate unavailable',
      );

      expect(context.recipients[0].status).toBe(
        SocialReplyCampaignRecipientStatus.DISPATCHING,
      );
      expect(context.campaigns[0].failedCount).toBe(0);
    });

    it('leaves a claim younger than the stale threshold untouched', async () => {
      const context = createContext({
        recipients: [
          createRecipient({
            dispatchedAt: new Date(
              Date.now() - SOCIAL_REPLY_CAMPAIGN_DISPATCH_STALE_MS + 60_000,
            ),
            id: 'recipient-in-flight',
            status: SocialReplyCampaignRecipientStatus.DISPATCHING,
          }),
        ],
      });

      const result = await context.service.dispatchTick(TICK);

      expect(result.outcome).toBe('throttled');
      expect(context.recipients[0].status).toBe(
        SocialReplyCampaignRecipientStatus.DISPATCHING,
      );
      expect(context.actionService.postReply).not.toHaveBeenCalled();
    });
  });
});
