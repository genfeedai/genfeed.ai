import { AgentBrandContextAskService } from '@api/services/agent-orchestrator/tools/agent-brand-context-ask.service';
import type { IBrandContextAskRequest } from '@genfeedai/contracts/interfaces';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const SCOPE = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  threadId: 'thread-1',
};

/** The offer card as the Missing Brand Context section renders it. */
const OFFER_CARD: IBrandContextAskRequest = {
  allowFreeText: false,
  isMultiSelect: false,
  options: [
    { id: 'products', label: 'Products' },
    { id: 'services', label: 'Services' },
    { id: 'memberships', label: 'Memberships' },
    { id: 'free_trial', label: 'Free trial or demo' },
    { id: 'skip', label: 'Skip' },
  ],
  requestId: 'brand_context:offer',
};

function createService(agentConfig: Record<string, unknown> | null = {}) {
  const brandsService = {
    findOne: vi
      .fn()
      .mockResolvedValue(
        agentConfig === null ? null : { agentConfig, id: 'brand-1' },
      ),
    updateAgentConfig: vi.fn().mockResolvedValue({ id: 'brand-1' }),
  };
  const prisma = { agentThread: { findFirst: vi.fn() } };
  return {
    brandsService,
    prisma,
    service: new AgentBrandContextAskService(
      brandsService as never,
      prisma as never,
    ),
  };
}

describe('AgentBrandContextAskService.recordAsk', () => {
  it('ignores request_input calls that are not brand context asks', async () => {
    const { service, brandsService } = createService();
    await expect(
      service.recordAsk({ ...OFFER_CARD, requestId: 'ask-1' }, SCOPE, NOW),
    ).resolves.toBe(false);
    expect(brandsService.findOne).not.toHaveBeenCalled();
  });

  it('records the ask on the brand inside the organization', async () => {
    const earlier = {
      askedAt: '2026-09-01T00:00:00.000Z',
      threadId: 'thread-0',
    };
    const { service, brandsService } = createService({
      brandContextAsks: { goals: earlier },
    });
    await expect(service.recordAsk(OFFER_CARD, SCOPE, NOW)).resolves.toBe(true);
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
      'brand-1',
      'org-1',
      {
        brandContextAsks: {
          goals: earlier,
          offer: { askedAt: NOW.toISOString(), threadId: 'thread-1' },
        },
      },
    );
  });

  it('rejects a second ask in the same conversation', async () => {
    const { service, brandsService } = createService({
      brandContextAsks: {
        goals: { askedAt: '2026-09-01T00:00:00.000Z', threadId: 'thread-1' },
      },
    });
    await expect(service.recordAsk(OFFER_CARD, SCOPE, NOW)).rejects.toThrow(
      'Do not ask for this brand context now',
    );
    expect(brandsService.updateAgentConfig).not.toHaveBeenCalled();
  });

  it.each([
    [
      'asked within 7 days',
      {
        brandContextAsks: {
          offer: { askedAt: '2026-10-05T12:00:00.000Z', threadId: 'thread-0' },
        },
      },
    ],
    [
      'skipped within 7 days',
      {
        onboardingAnswers: {
          fields: {
            offer: { status: 'skipped', updatedAt: '2026-10-08T12:00:00.000Z' },
          },
        },
      },
    ],
    ['already filled', { strategy: { offers: ['Coaching'] } }],
    [
      'asked anything on the brand within 24 hours',
      {
        brandContextAsks: {
          cadence: {
            askedAt: '2026-10-10T02:00:00.000Z',
            threadId: 'thread-0',
          },
        },
      },
    ],
  ])('rejects a field %s', async (_label, agentConfig) => {
    const { service, brandsService } = createService(agentConfig);
    await expect(service.recordAsk(OFFER_CARD, SCOPE, NOW)).rejects.toThrow(
      BadRequestException,
    );
    expect(brandsService.updateAgentConfig).not.toHaveBeenCalled();
  });

  it.each([
    ['free text', { allowFreeText: undefined }],
    [
      'a reworded option',
      {
        options: [
          { id: 'products', label: 'Our products' },
          ...OFFER_CARD.options.slice(1),
        ],
      },
    ],
    [
      'Skip not last',
      {
        options: [OFFER_CARD.options[4], ...OFFER_CARD.options.slice(0, 4)],
      },
    ],
    ['a multi-select', { isMultiSelect: true, maxSelections: 2 }],
  ])('rejects a card sent with %s', async (_label, change) => {
    const { service, brandsService } = createService();
    await expect(
      service.recordAsk(
        { ...OFFER_CARD, ...change } as IBrandContextAskRequest,
        SCOPE,
        NOW,
      ),
    ).rejects.toThrow('exactly');
    expect(brandsService.updateAgentConfig).not.toHaveBeenCalled();
  });

  it('requires a brand in this organization', async () => {
    const { service } = createService(null);
    await expect(service.recordAsk(OFFER_CARD, SCOPE, NOW)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.recordAsk(OFFER_CARD, { ...SCOPE, brandId: undefined }, NOW),
    ).rejects.toThrow('Choose a brand');
  });
});

describe('AgentBrandContextAskService.resolveSaveMode', () => {
  it('keeps threadless and onboarding-thread saves on the onboarding contract', async () => {
    const { service, prisma } = createService();
    await expect(
      service.resolveSaveMode({ organizationId: 'org-1', userId: 'user-1' }),
    ).resolves.toBe('onboarding');
    expect(prisma.agentThread.findFirst).not.toHaveBeenCalled();
    prisma.agentThread.findFirst.mockResolvedValue({ source: 'onboarding' });
    await expect(
      service.resolveSaveMode({
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      }),
    ).resolves.toBe('onboarding');
  });

  it.each([{ source: 'agent' }, { source: null }, null])(
    'treats any other thread as in-flow: %j',
    async (thread) => {
      const { service, prisma } = createService();
      prisma.agentThread.findFirst.mockResolvedValue(thread);
      await expect(
        service.resolveSaveMode({
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).resolves.toBe('in_flow');
    },
  );
});
