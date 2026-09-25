import { AgentModelAccessService } from '@api/services/agent-orchestrator/agent-model-access.service';
import type { ByokService } from '@api/services/byok/byok.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ByokProvider,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@genfeedai/contracts';
import {
  AGENT_CHAT_MODEL_KEYS,
  LLM_DEFAULTS,
} from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';

const configMocks = vi.hoisted(() => ({
  hasOrganizationBilling: vi.fn(() => true),
}));

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: configMocks.hasOrganizationBilling,
}));

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function activeSubscription() {
  return {
    cancelAtPeriodEnd: false,
    currentPeriodEnd: FUTURE,
    plan: SubscriptionPlan.MONTHLY,
    status: SubscriptionStatus.ACTIVE,
  };
}

function createService(options: {
  byokProviders?: ByokProvider[];
  subscriptionTier?: string | null;
  subscriptions?: ReturnType<typeof activeSubscription>[];
  subscriptionReadFails?: boolean;
}) {
  const prisma = {
    organizationSetting: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ subscriptionTier: options.subscriptionTier }),
    },
    subscription: {
      findMany: options.subscriptionReadFails
        ? vi.fn().mockRejectedValue(new Error('db down'))
        : vi.fn().mockResolvedValue(options.subscriptions ?? []),
    },
  };
  const byokService = {
    isByokActiveForProvider: vi.fn(
      async (_organizationId: string, provider: ByokProvider) =>
        (options.byokProviders ?? []).includes(provider),
    ),
  };
  const service = new AgentModelAccessService(
    prisma as unknown as PrismaService,
    byokService as unknown as ByokService,
    { warn: vi.fn() } as unknown as LoggerService,
  );
  return { byokService, prisma, service };
}

describe('AgentModelAccessService free-tier lock', () => {
  beforeEach(() => {
    configMocks.hasOrganizationBilling.mockReturnValue(true);
  });

  it.each([
    ['a strategy / org override pin', AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5],
    ['a creative agent-type default', LLM_DEFAULTS.creativeAgent],
    ['a requested frontier model', AGENT_CHAT_MODEL_KEYS.GPT_5_6_SOL],
    ['the dynamic router', AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO],
  ])(
    'locks an unsubscribed org to DeepSeek regardless of %s',
    async (_label, model) => {
      const { service } = createService({ subscriptions: [] });

      await expect(service.enforceModel('org-1', model)).resolves.toBe(
        LLM_DEFAULTS.agentChat,
      );
    },
  );

  it('reports the lock with the pinned model for pickers', async () => {
    const { service } = createService({ subscriptionTier: 'free' });

    await expect(service.resolveAccess('org-1')).resolves.toEqual({
      isLocked: true,
      lockedModelKey: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
      lockedModelLabel: 'DeepSeek V4 Flash',
      reason: 'free_tier',
    });
  });

  it('honours the override for an org with an active paid subscription', async () => {
    const { service } = createService({
      subscriptions: [activeSubscription()],
    });

    await expect(
      service.enforceModel('org-1', AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5),
    ).resolves.toBe(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5);
    await expect(service.resolveAccess('org-1')).resolves.toEqual(
      expect.objectContaining({ isLocked: false, lockedModelKey: null }),
    );
  });

  it('keeps full choice while a cancelled plan is still inside its paid period', async () => {
    const { service } = createService({
      subscriptions: [
        { ...activeSubscription(), status: SubscriptionStatus.CANCELLED },
      ],
    });

    await expect(
      service.enforceModel('org-1', AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5),
    ).resolves.toBe(AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5);
  });

  it('locks a trial, which is not a paid subscription', async () => {
    const { service } = createService({
      subscriptions: [
        { ...activeSubscription(), status: SubscriptionStatus.TRIALING },
      ],
    });

    await expect(
      service.enforceModel('org-1', AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5),
    ).resolves.toBe(LLM_DEFAULTS.agentChat);
  });

  it('never locks a self-hosted / no-billing deployment', async () => {
    configMocks.hasOrganizationBilling.mockReturnValue(false);
    const { prisma, service } = createService({ subscriptions: [] });

    await expect(
      service.enforceModel('org-1', AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5),
    ).resolves.toBe(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5);
    await expect(service.resolveAccess('org-1')).resolves.toEqual(
      expect.objectContaining({ isLocked: false }),
    );
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
  });

  it('never locks a route the org BYOK key pays for', async () => {
    const native = createService({ byokProviders: [ByokProvider.ANTHROPIC] });
    await expect(
      native.service.enforceModel('org-1', AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5),
    ).resolves.toBe(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5);

    const openRouter = createService({
      byokProviders: [ByokProvider.OPENROUTER],
    });
    await expect(
      openRouter.service.enforceModel('org-1', AGENT_CHAT_MODEL_KEYS.GROK_4_6),
    ).resolves.toBe(AGENT_CHAT_MODEL_KEYS.GROK_4_6);
  });

  it('still locks a route the org BYOK key does not cover', async () => {
    const { service } = createService({
      byokProviders: [ByokProvider.ANTHROPIC],
    });

    await expect(
      service.enforceModel('org-1', AGENT_CHAT_MODEL_KEYS.GPT_5_6_SOL),
    ).resolves.toBe(LLM_DEFAULTS.agentChat);
  });

  it('fails closed onto the free model when the subscription read fails', async () => {
    const { service } = createService({ subscriptionReadFails: true });

    await expect(
      service.enforceModel('org-1', AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5),
    ).resolves.toBe(LLM_DEFAULTS.agentChat);
  });

  it('caches the subscription decision per organization', async () => {
    const { prisma, service } = createService({
      subscriptions: [activeSubscription()],
    });

    await service.enforceModel('org-1', AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5);
    await service.enforceModel('org-1', AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5);

    expect(prisma.subscription.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDeleted: false, organizationId: 'org-1' },
      }),
    );
  });
});
