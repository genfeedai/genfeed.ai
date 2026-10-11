import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AgentBrandContextAskService } from '@api/services/agent-orchestrator/tools/agent-brand-context-ask.service';
import { AgentOnboardingBrandSetupToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-brand-setup-tool-handler.service';
import {
  type AgentToolDispatchHandlers,
  dispatchRegisteredAgentTool,
} from '@api/services/agent-orchestrator/tools/agent-tool-dispatch.routes';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  RequestTimeoutException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const CONTEXT: ToolExecutionContext = {
  organizationId: 'organization-1',
  userId: 'user-1',
};

function createHandler(options?: {
  brand?: Record<string, unknown>;
  threadSource?: string | null;
}) {
  const brandsService = {
    findOne: vi.fn().mockResolvedValue(options?.brand ?? null),
    updateAgentConfig: vi
      .fn()
      .mockImplementation(
        async (id: string, _organizationId: string, agentConfig: unknown) => ({
          agentConfig,
          id,
        }),
      ),
  };
  const credentialsService = {
    findConnectedAccounts: vi.fn().mockResolvedValue([]),
  };
  const onboardingCreditGrantsService = {
    grantOnboardingAnswerCredits: vi
      .fn()
      .mockImplementation(
        async (_organizationId: string, _brandId: string, fieldIds: string[]) =>
          fieldIds,
      ),
  };
  const signupPrefillService = { scanBrandUrl: vi.fn() };
  const loggerService = { error: vi.fn(), warn: vi.fn() };
  const organizationsService = {
    findOne: vi.fn().mockResolvedValue({ accountType: 'EXPERT' }),
    patch: vi.fn(),
  };
  const usersService = { findOne: vi.fn(), patch: vi.fn(), patchAll: vi.fn() };
  const userAccessCacheService = { invalidateAll: vi.fn() };
  const prisma = {
    agentThread: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options?.threadSource === undefined
            ? null
            : { source: options.threadSource },
        ),
    },
  };
  const handler = new AgentOnboardingBrandSetupToolHandler(
    loggerService as never,
    brandsService as never,
    new BrandDataMapper(),
    new AgentBrandContextAskService(brandsService as never, prisma as never),
    signupPrefillService as never,
    organizationsService as never,
    usersService as never,
    userAccessCacheService as never,
    credentialsService as never,
    onboardingCreditGrantsService as never,
  );
  return {
    handler,
    brandsService,
    prisma,
    credentialsService,
    onboardingCreditGrantsService,
    signupPrefillService,
    loggerService,
    organizationsService,
    usersService,
    userAccessCacheService,
  };
}

describe('saveOnboardingAnswers', () => {
  it('merges supplied strategy answers and tone while preserving other keys', async () => {
    const { handler, brandsService } = createHandler({
      brand: {
        id: 'brand-1',
        agentConfig: {
          persona: 'Founder',
          strategy: {
            goals: ['Old goal'],
            platforms: ['x'],
            frequency: 'daily',
            topics: ['AI'],
          },
          voice: { tone: 'Formal', style: 'Concise', bannedPhrases: ['hype'] },
        },
      },
    });
    const result = await handler.execute(
      'save_onboarding_answers',
      {
        goals: [' Awareness '],
        platforms: ['linkedin'],
        cadence: 'weekly',
        toneAdjustment: 'Friendly',
      },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      organizationId: CONTEXT.organizationId,
      isDeleted: false,
    });
    expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
      'brand-1',
      CONTEXT.organizationId,
      {
        strategy: {
          goals: ['Awareness'],
          platforms: ['linkedin'],
          frequency: 'weekly',
          topics: ['AI'],
        },
        voice: { tone: 'Friendly', style: 'Concise', bannedPhrases: ['hype'] },
        onboardingAnswers: {
          fields: {
            goals: { status: 'answered', updatedAt: expect.any(String) },
            platforms: { status: 'answered', updatedAt: expect.any(String) },
            tone: { status: 'answered', updatedAt: expect.any(String) },
            cadence: { status: 'answered', updatedAt: expect.any(String) },
          },
        },
      },
    );
    expect(result).toMatchObject({
      success: true,
      creditsUsed: 0,
      data: {
        brandId: 'brand-1',
        answeredFields: ['goals', 'platforms', 'tone', 'cadence'],
        creditsEarned: 20,
      },
    });
  });

  it('preserves omitted answers and does not rewrite other config sections', async () => {
    const { handler, brandsService } = createHandler({
      brand: {
        agentConfig: {
          strategy: { goals: ['Keep'], topics: ['AI'] },
          voice: { tone: 'Keep' },
          schedule: { timezone: 'UTC' },
        },
      },
    });
    await handler.saveOnboardingAnswers(
      { platforms: [] },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
      'brand-1',
      CONTEXT.organizationId,
      {
        strategy: { goals: ['Keep'], topics: ['AI'], platforms: [] },
        onboardingAnswers: { fields: {} },
      },
    );
  });

  it.each([
    { goals: Array(11).fill('goal') },
    { platforms: [null] },
    { goals: [' '] },
    { cadence: 'x'.repeat(201) },
    { toneAdjustment: 42 },
    { brandId: 42 },
    { audience: ['a', 'b', 'c'] },
    { competitors: ['a', 'b', 'c', 'd'] },
    { offer: ['Memberships'] },
    { skippedFields: ['website'] },
    { skippedFields: 'audience' },
    { audience: ['Gym owners'], skippedFields: ['audience'] },
  ])('rejects malformed or oversized answers %j', async (params) => {
    const { handler, brandsService } = createHandler();
    await expect(
      handler.saveOnboardingAnswers(params, { ...CONTEXT, brandId: 'brand-1' }),
    ).rejects.toThrow();
    expect(brandsService.updateAgentConfig).not.toHaveBeenCalled();
  });

  it('persists audience, offer and competitors into the fields generation reads and raises the score', async () => {
    const { handler, brandsService, onboardingCreditGrantsService } =
      createHandler({
        brand: {
          agentConfig: {
            strategy: { goals: ['Drive sales'] },
            voice: { tone: 'Direct', audience: ['Everyone'] },
          },
        },
      });
    const result = await handler.saveOnboardingAnswers(
      {
        audience: ['Gym owners', 'Personal trainers'],
        offer: '12-week coaching',
        competitors: ['Forge Fit'],
      },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
      'brand-1',
      CONTEXT.organizationId,
      {
        strategy: {
          goals: ['Drive sales'],
          offers: ['12-week coaching'],
          competitors: ['Forge Fit'],
        },
        voice: {
          tone: 'Direct',
          audience: ['Gym owners', 'Personal trainers'],
        },
        onboardingAnswers: {
          fields: {
            audience: { status: 'answered', updatedAt: expect.any(String) },
            offer: { status: 'answered', updatedAt: expect.any(String) },
            competitors: { status: 'answered', updatedAt: expect.any(String) },
          },
        },
      },
    );
    expect(
      onboardingCreditGrantsService.grantOnboardingAnswerCredits,
    ).toHaveBeenCalledWith(
      CONTEXT.organizationId,
      'brand-1',
      ['audience', 'offer', 'competitors'],
      CONTEXT.userId,
    );
    expect(result.data).toMatchObject({
      creditsEarned: 15,
      rewardedFields: ['audience', 'offer', 'competitors'],
    });
    expect(result.data?.completenessScore).toBeGreaterThan(
      (
        await createHandler({
          brand: { agentConfig: { strategy: { goals: ['Drive sales'] } } },
        }).handler.saveOnboardingAnswers({}, { ...CONTEXT, brandId: 'brand-1' })
      ).data?.completenessScore as number,
    );
  });

  it('records skips without saving a value or granting credits, keeping earlier answers', async () => {
    const { handler, brandsService, onboardingCreditGrantsService } =
      createHandler({
        brand: {
          agentConfig: {
            onboardingAnswers: {
              fields: {
                goals: {
                  status: 'answered',
                  updatedAt: '2026-10-10T00:00:00Z',
                },
              },
            },
            strategy: { goals: ['Drive sales'] },
          },
        },
      });
    const result = await handler.saveOnboardingAnswers(
      { skippedFields: ['competitors', 'competitors'] },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
      'brand-1',
      CONTEXT.organizationId,
      {
        strategy: { goals: ['Drive sales'] },
        onboardingAnswers: {
          fields: {
            goals: { status: 'answered', updatedAt: '2026-10-10T00:00:00Z' },
            competitors: { status: 'skipped', updatedAt: expect.any(String) },
          },
        },
      },
    );
    expect(
      onboardingCreditGrantsService.grantOnboardingAnswerCredits,
    ).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      answeredFields: [],
      skippedFields: ['competitors'],
      creditsEarned: 0,
    });
  });

  it('counts keep as a tone answer without overwriting the scanned voice', async () => {
    const { handler, brandsService } = createHandler({
      brand: { agentConfig: { voice: { tone: 'Direct' } } },
    });
    const result = await handler.saveOnboardingAnswers(
      { toneAdjustment: 'keep' },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    const saved = brandsService.updateAgentConfig.mock.calls[0]?.[2];
    expect(saved).not.toHaveProperty('voice');
    expect(result.data).toMatchObject({ answeredFields: ['tone'] });
  });

  it('learns tone from Instagram only once the brand has a connected Instagram account', async () => {
    const { handler, brandsService, credentialsService } = createHandler({
      brand: { agentConfig: { voice: { tone: 'Direct' } } },
    });
    await expect(
      handler.saveOnboardingAnswers(
        { toneAdjustment: 'learn_from_instagram' },
        { ...CONTEXT, brandId: 'brand-1' },
      ),
    ).rejects.toThrow('Connect Instagram');
    expect(brandsService.updateAgentConfig).not.toHaveBeenCalled();

    credentialsService.findConnectedAccounts.mockResolvedValue([
      { id: 'credential-1' },
    ]);
    const result = await handler.saveOnboardingAnswers(
      { toneAdjustment: 'learn_from_instagram' },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(credentialsService.findConnectedAccounts).toHaveBeenCalledWith(
      CONTEXT.organizationId,
      'brand-1',
      'instagram',
    );
    expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
      'brand-1',
      CONTEXT.organizationId,
      {
        strategy: {},
        onboardingAnswers: {
          fields: {
            tone: { status: 'answered', updatedAt: expect.any(String) },
          },
          voiceSource: 'instagram',
        },
      },
    );
    expect(result.data).toMatchObject({ answeredFields: ['tone'] });
  });

  it('keeps the save when the credit grant fails', async () => {
    const { handler, onboardingCreditGrantsService, loggerService } =
      createHandler({ brand: { agentConfig: {} } });
    onboardingCreditGrantsService.grantOnboardingAnswerCredits.mockRejectedValue(
      new Error('ledger down'),
    );
    const result = await handler.saveOnboardingAnswers(
      { goals: ['Drive sales'] },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(result).toMatchObject({
      success: true,
      data: { answeredFields: ['goals'], creditsEarned: 0 },
    });
    expect(loggerService.warn).toHaveBeenCalledWith(
      'Onboarding answer credit grant failed',
      expect.objectContaining({ error: 'ledger down' }),
    );
  });

  describe('in-flow brand context answers after onboarding', () => {
    const THREAD_CONTEXT: ToolExecutionContext = {
      ...CONTEXT,
      brandId: 'brand-1',
      threadId: 'thread-1',
    };
    const askedBrand = (threadId: string) => ({
      id: 'brand-1',
      agentConfig: {
        brandContextAsks: {
          audience: { askedAt: new Date().toISOString(), threadId },
        },
      },
    });

    it('treats threadless and onboarding-thread saves as onboarding and grants credits', async () => {
      for (const options of [
        { threadSource: 'onboarding' as const, context: THREAD_CONTEXT },
        {
          threadSource: undefined,
          context: { ...CONTEXT, brandId: 'brand-1' },
        },
      ]) {
        const { handler, onboardingCreditGrantsService } = createHandler({
          brand: { id: 'brand-1', agentConfig: {} },
          threadSource: options.threadSource,
        });
        const result = await handler.saveOnboardingAnswers(
          { goals: ['Drive sales'] },
          options.context,
        );
        expect(
          onboardingCreditGrantsService.grantOnboardingAnswerCredits,
        ).toHaveBeenCalledWith(
          CONTEXT.organizationId,
          'brand-1',
          ['goals'],
          CONTEXT.userId,
        );
        expect(result.data).toMatchObject({ creditsEarned: 5 });
      }
    });

    it('looks the thread up inside the organization and skips deleted threads', async () => {
      const { handler, prisma } = createHandler({
        brand: askedBrand('thread-1'),
        threadSource: 'agent',
      });
      await handler.saveOnboardingAnswers(
        { audience: ['Founders'] },
        THREAD_CONTEXT,
      );
      expect(prisma.agentThread.findFirst).toHaveBeenCalledWith({
        select: { source: true },
        where: {
          id: 'thread-1',
          isDeleted: false,
          organizationId: CONTEXT.organizationId,
        },
      });
    });

    it('saves the asked field in a normal thread the same way, without credits', async () => {
      const { handler, brandsService, onboardingCreditGrantsService } =
        createHandler({ brand: askedBrand('thread-1'), threadSource: 'agent' });
      const result = await handler.saveOnboardingAnswers(
        { audience: ['Founders'] },
        THREAD_CONTEXT,
      );
      expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
        'brand-1',
        CONTEXT.organizationId,
        expect.objectContaining({
          voice: { audience: ['Founders'] },
          onboardingAnswers: {
            fields: {
              audience: { status: 'answered', updatedAt: expect.any(String) },
            },
          },
        }),
      );
      expect(
        onboardingCreditGrantsService.grantOnboardingAnswerCredits,
      ).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({
        answeredFields: ['audience'],
        creditsEarned: 0,
        rewardedFields: [],
      });
    });

    it('records an in-flow skip without credits', async () => {
      const { handler, brandsService, onboardingCreditGrantsService } =
        createHandler({ brand: askedBrand('thread-1'), threadSource: 'agent' });
      await handler.saveOnboardingAnswers(
        { skippedFields: ['audience'] },
        THREAD_CONTEXT,
      );
      expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
        'brand-1',
        CONTEXT.organizationId,
        expect.objectContaining({
          onboardingAnswers: {
            fields: {
              audience: { status: 'skipped', updatedAt: expect.any(String) },
            },
          },
        }),
      );
      expect(
        onboardingCreditGrantsService.grantOnboardingAnswerCredits,
      ).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a field this conversation never asked',
        { offer: 'Coaching' },
        'thread-1',
      ],
      [
        'a field asked in another conversation',
        { audience: ['Founders'] },
        'thread-2',
      ],
      [
        'an asked field plus an unasked one',
        { audience: ['Founders'], goals: ['Drive sales'] },
        'thread-1',
      ],
    ])('rejects %s without writing', async (_label, params, askedIn) => {
      const { handler, brandsService } = createHandler({
        brand: askedBrand(askedIn),
        threadSource: 'agent',
      });
      await expect(
        handler.saveOnboardingAnswers(params, THREAD_CONTEXT),
      ).rejects.toThrow('brand context card in this conversation');
      expect(brandsService.updateAgentConfig).not.toHaveBeenCalled();
    });

    it('treats a thread it cannot find as in-flow, never as onboarding', async () => {
      const { handler, brandsService } = createHandler({
        brand: { id: 'brand-1', agentConfig: {} },
        threadSource: undefined,
      });
      await expect(
        handler.saveOnboardingAnswers(
          { goals: ['Drive sales'] },
          THREAD_CONTEXT,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(brandsService.updateAgentConfig).not.toHaveBeenCalled();
    });

    it('keeps invalid answers rejected before any thread or brand lookup', async () => {
      const { handler, brandsService, prisma } = createHandler({
        brand: askedBrand('thread-1'),
        threadSource: 'agent',
      });
      await expect(
        handler.saveOnboardingAnswers(
          { audience: ['a', 'b', 'c'] },
          THREAD_CONTEXT,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(brandsService.findOne).not.toHaveBeenCalled();
      expect(prisma.agentThread.findFirst).not.toHaveBeenCalled();
    });
  });

  it('rejects a brand outside the current thread', async () => {
    const { handler, brandsService } = createHandler();
    await expect(
      handler.saveOnboardingAnswers(
        { brandId: 'other' },
        { ...CONTEXT, brandId: 'brand-1' },
      ),
    ).rejects.toThrow();
    expect(brandsService.findOne).not.toHaveBeenCalled();
  });

  it('rejects unavailable foreign or deleted brands and a missing current brand', async () => {
    const { handler, brandsService } = createHandler();
    await expect(
      handler.saveOnboardingAnswers({ brandId: 'foreign' }, CONTEXT),
    ).rejects.toThrow('not available');
    await expect(handler.saveOnboardingAnswers({}, CONTEXT)).rejects.toThrow(
      'current brand',
    );
    expect(brandsService.updateAgentConfig).not.toHaveBeenCalled();
  });
});

describe('scan_brand_url', () => {
  it('returns a compact summary and an existing card with the discovered logo and colors', async () => {
    const h = createHandler();
    h.signupPrefillService.scanBrandUrl.mockResolvedValue({
      scrapeStatus: 'scraped',
      status: 'completed',
      summary: {
        name: 'Acme',
        description: 'Tools for makers',
        tone: 'Friendly',
        primaryColor: '#123456',
        secondaryColor: '#654321',
        logoUrl: 'https://acme.example/logo.png',
      },
    });
    const result = await h.handler.execute(
      'scan_brand_url',
      { url: 'acme.example/product' },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(h.signupPrefillService.scanBrandUrl).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        organizationId: 'organization-1',
        userId: 'user-1',
      },
      'https://acme.example/product',
      expect.any(Function),
    );
    expect(result).toMatchObject({
      success: true,
      creditsUsed: 0,
      data: {
        status: 'scanned',
        sourceUrl: 'https://acme.example/product',
        brandId: 'brand-1',
        summary: { name: 'Acme' },
      },
      nextActions: [
        {
          type: 'completion_summary_card',
          title: 'Acme',
          outcomeBullets: [
            'Primary color: #123456',
            'Secondary color: #654321',
            'Tone: Friendly',
          ],
          outputVariants: [
            { kind: 'image', url: 'https://acme.example/logo.png' },
          ],
        },
      ],
    });
  });

  it.each([0, 5])(
    'reports actual settled spend %s including BYOK zero',
    async (credits) => {
      const h = createHandler();
      h.signupPrefillService.scanBrandUrl.mockImplementation(
        async (_request, _url, report: (credits: number) => void) => {
          if (credits) report(credits);
          return { scrapeStatus: 'scraped', summary: { name: 'Acme' } };
        },
      );
      expect(
        await h.handler.scanBrandUrl(
          { url: 'https://acme.example' },
          { ...CONTEXT, brandId: 'brand-1' },
        ),
      ).toMatchObject({ creditsUsed: credits });
    },
  );

  it('keeps settled credits on a later scan failure and sanitizes logged URLs', async () => {
    const h = createHandler();
    h.signupPrefillService.scanBrandUrl.mockImplementation(
      async (_request, _url, report: (credits: number) => void) => {
        report(5);
        throw new Error('persistence failed');
      },
    );
    expect(
      await h.handler.scanBrandUrl(
        { url: 'https://acme.example/?token=secret' },
        { ...CONTEXT, brandId: 'brand-1' },
      ),
    ).toMatchObject({ creditsUsed: 5, data: { reason: 'scan_failed' } });
    expect(h.loggerService.warn).toHaveBeenCalledWith(
      'Onboarding brand scan failed',
      expect.objectContaining({ sourceUrl: 'https://acme.example/' }),
    );
  });

  it('reports scrape failure as an agent-readable choice point', async () => {
    const h = createHandler();
    h.signupPrefillService.scanBrandUrl.mockResolvedValue({
      scrapeStatus: 'failed',
      scrapeReason: 'scrape_failed',
    });
    expect(
      await h.handler.scanBrandUrl(
        { url: 'https://acme.example' },
        { ...CONTEXT, brandId: 'brand-1' },
      ),
    ).toMatchObject({
      success: true,
      data: { status: 'failed', reason: 'scrape_failed' },
    });
  });

  it.each([
    [new RequestTimeoutException('secret'), 'timeout'],
    [new NotFoundException('secret'), 'brand_not_found'],
    [new ForbiddenException('secret'), 'forbidden'],
    [new ConflictException('scan_in_progress'), 'scan_in_progress'],
    [new BadRequestException('secret'), 'invalid_url'],
    [new Error('secret'), 'scan_failed'],
    ['secret', 'scan_failed'],
  ])('sanitizes %s into %s', async (error, reason) => {
    const h = createHandler();
    h.signupPrefillService.scanBrandUrl.mockRejectedValue(error);
    const result = await h.handler.scanBrandUrl(
      { url: 'https://acme.example' },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(result).toMatchObject({
      success: true,
      data: { status: 'failed', reason },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(h.loggerService.warn).toHaveBeenCalledWith(
      'Onboarding brand scan failed',
      {
        brandId: 'brand-1',
        error: error instanceof Error ? error.message : String(error),
        organizationId: CONTEXT.organizationId,
        sourceUrl: 'https://acme.example/',
      },
    );
  });

  it('rejects a different thread brand before invoking prefill', async () => {
    const h = createHandler();
    const result = await h.handler.scanBrandUrl(
      { url: 'https://acme.example', brandId: 'foreign-brand' },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(result).toMatchObject({
      success: true,
      data: { status: 'failed', reason: 'brand_not_found' },
    });
    expect(h.signupPrefillService.scanBrandUrl).not.toHaveBeenCalled();
  });
});

describe('brand setup dispatch', () => {
  it.each(['scan_brand_url', 'save_onboarding_answers'] as const)(
    'routes %s to the focused handler',
    async (toolName) => {
      const execute = vi
        .fn()
        .mockResolvedValue({ success: true, creditsUsed: 0 });
      const handlers = {
        onboardingBrandSetupHandler: { execute },
      } as unknown as AgentToolDispatchHandlers;
      const params = { brandId: 'brand-1' };
      expect(
        await dispatchRegisteredAgentTool(handlers, toolName, params, CONTEXT),
      ).toEqual({ success: true, creditsUsed: 0 });
      expect(execute).toHaveBeenCalledWith(toolName, params, CONTEXT);
    },
  );
});

describe('Expert brand handoff', () => {
  it('persists brand progress without completing onboarding and returns a single positioning CTA', async () => {
    const h = createHandler({ brand: { id: 'brand-1' } });
    h.usersService.findOne.mockResolvedValue({
      id: CONTEXT.userId,
      onboardingStepsCompleted: ['positioning', 'brand'],
      onboardingStartedAt: new Date(),
    });
    const result = await h.handler.completeBrandOnboardingStep({
      ...CONTEXT,
      brandId: 'brand-1',
      threadId: 'thread-1',
    });
    expect(h.brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      organizationId: CONTEXT.organizationId,
      isDeleted: false,
    });
    expect(h.usersService.patch).toHaveBeenCalledWith(CONTEXT.userId, {
      onboardingStepsCompleted: ['positioning', 'brand'],
    });
    expect(h.userAccessCacheService.invalidateAll).toHaveBeenCalledWith(
      CONTEXT.userId,
    );
    expect(h.organizationsService.patch).not.toHaveBeenCalled();
    expect(h.usersService.patchAll).not.toHaveBeenCalled();
    // Outcome copy keeps the required Expert handoff visible in the transcript.
    expect(result.nextActions?.[0].summaryText).toContain('positioning');
    expect(result.nextActions?.[0].primaryCta).toEqual({
      label: 'Continue',
      href: '/onboarding/positioning',
    });
  });
  it('rejects non-experts and never writes progress', async () => {
    const h = createHandler({ brand: { id: 'brand-1' } });
    h.organizationsService.findOne.mockResolvedValue({
      accountType: 'CREATOR',
    });
    await expect(
      h.handler.completeBrandOnboardingStep(CONTEXT),
    ).rejects.toThrow('Expert onboarding');
    expect(h.usersService.patch).not.toHaveBeenCalled();
  });
  it('requires a saved brand before advancing', async () => {
    const h = createHandler();
    await expect(
      h.handler.completeBrandOnboardingStep(CONTEXT),
    ).rejects.toThrow('saved brand');
    expect(h.usersService.patch).not.toHaveBeenCalled();
  });
});
