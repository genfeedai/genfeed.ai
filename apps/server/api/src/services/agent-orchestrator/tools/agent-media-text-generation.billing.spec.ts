import { AgentMediaTextGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-text-generation.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { describe, expect, it, vi } from 'vitest';

/** A headless MCP call: no thread brand, so brand comes from params or the member. */
const headless = {
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

function createService(options: { hasCredits?: boolean } = {}) {
  const contentGeneratorService = {
    generateContent: vi
      .fn()
      .mockResolvedValue([
        { content: 'LinkedIn post', hashtags: [], hook: 'Hook' },
      ]),
  };
  const generationGateway = {
    generateArticle: vi.fn().mockResolvedValue({
      data: { attributes: { content: 'Body', label: 'Title' }, id: 'art-1' },
    }),
  };
  const brandsService = {
    findOne: vi.fn(async (query: { id?: string }) =>
      query.id === 'brand-1' ? { id: 'brand-1' } : null,
    ),
  };
  const membersService = { findOne: vi.fn().mockResolvedValue(null) };
  const credits = {
    checkOrganizationCreditsAvailable: vi
      .fn()
      .mockResolvedValue(options.hasCredits ?? true),
    deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
  };
  const brandedTextActions = {
    draftReplyVariants: vi.fn().mockResolvedValue({
      hasNewDispatch: true,
      kind: 'completed',
      result: {
        hasBrandVoice: true,
        isReplayed: false,
        maxCharacters: 280,
        platform: 'twitter',
        tone: 'agree',
        variants: ['One', 'Two'],
      },
    }),
    run: vi.fn().mockResolvedValue({
      hasNewDispatch: true,
      kind: 'completed',
      result: {
        hasBrandVoice: true,
        isReplayed: false,
        maxCharacters: 280,
        mode: 'rewrite',
        platform: 'twitter',
        receiptId: 'receipt-1',
        text: 'Rewritten',
      },
    }),
  };
  const service = new AgentMediaTextGenerationService(
    {} as never,
    contentGeneratorService as never,
    {} as never,
    generationGateway as never,
    brandsService as never,
    membersService as never,
    credits as never,
    brandedTextActions as never,
  );
  return {
    brandedTextActions,
    contentGeneratorService,
    credits,
    generationGateway,
    service,
  };
}

describe('AgentMediaTextGenerationService billing and brand scope', () => {
  it('charges social generation once and marks it billing-delegated', async () => {
    const { credits, service } = createService();

    const result = await service.generateContent(
      {
        brandId: 'brand-1',
        platform: 'linkedin',
        topic: 'Launch',
        type: 'post',
      },
      headless,
    );

    expect(result).toMatchObject({
      creditsUsed: 2,
      isBillingDelegated: true,
      success: true,
    });
    expect(credits.deductCreditsFromOrganization).toHaveBeenCalledOnce();
    expect(credits.deductCreditsFromOrganization).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      2,
      expect.stringContaining('generate_content'),
      expect.anything(),
      { brandId: 'brand-1' },
    );
  });

  it('refuses social generation without credits and charges nothing', async () => {
    const { contentGeneratorService, credits, service } = createService({
      hasCredits: false,
    });

    const result = await service.generateContent(
      {
        brandId: 'brand-1',
        platform: 'linkedin',
        topic: 'Launch',
        type: 'post',
      },
      headless,
    );

    expect(result).toMatchObject({
      error: 'Not enough credits to generate content.',
      success: false,
    });
    expect(contentGeneratorService.generateContent).not.toHaveBeenCalled();
    expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });

  it('charges nothing when the generator returns no draft', async () => {
    const { contentGeneratorService, credits, service } = createService();
    contentGeneratorService.generateContent.mockResolvedValue([]);

    const result = await service.generateContent(
      {
        brandId: 'brand-1',
        platform: 'linkedin',
        topic: 'Launch',
        type: 'post',
      },
      headless,
    );

    expect(result).toMatchObject({ creditsUsed: 0, success: false });
    expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });

  it('generates a headless article under the explicit brand', async () => {
    const { generationGateway, service } = createService();

    await service.generateContent(
      { brandId: 'brand-1', topic: 'Guide', type: 'article' },
      headless,
    );

    expect(generationGateway.generateArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: expect.objectContaining({ brandId: 'brand-1' }),
      }),
    );
  });

  it('rejects a headless article when no brand resolves', async () => {
    const { generationGateway, service } = createService();

    const result = await service.generateContent(
      { topic: 'Guide', type: 'article' },
      headless,
    );

    expect(result).toMatchObject({
      error: 'A brand is required to generate an article.',
      success: false,
    });
    expect(generationGateway.generateArticle).not.toHaveBeenCalled();
  });

  describe('refineText', () => {
    const params = {
      brandId: 'brand-1',
      mode: 'rewrite',
      platform: 'twitter',
      requestKey: '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c',
      text: 'Draft to rewrite',
    };

    it('runs the branded text action once and charges the new dispatch', async () => {
      const { brandedTextActions, credits, service } = createService();

      const result = await service.refineText(params, headless);

      expect(result).toMatchObject({
        creditsUsed: 2,
        data: { hasBrandVoice: true, text: 'Rewritten' },
        isBillingDelegated: true,
        success: true,
      });
      expect(brandedTextActions.run).toHaveBeenCalledExactlyOnceWith({
        actor: { organizationId: 'org-1', userId: 'user-1' },
        brandId: 'brand-1',
        mode: 'rewrite',
        platform: 'twitter',
        requestKey: params.requestKey,
        text: 'Draft to rewrite',
      });
      expect(credits.deductCreditsFromOrganization).toHaveBeenCalledOnce();
      expect(credits.deductCreditsFromOrganization).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        2,
        expect.stringContaining('refine_text'),
        expect.anything(),
        { brandId: 'brand-1' },
      );
    });

    it('answers a replay from the receipt without charging', async () => {
      const { brandedTextActions, credits, service } = createService();
      brandedTextActions.run.mockResolvedValue({
        hasNewDispatch: false,
        kind: 'completed',
        result: { isReplayed: true, text: 'Rewritten' },
      });

      const result = await service.refineText(params, headless);

      expect(result).toMatchObject({ creditsUsed: 0, success: true });
      expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
    });

    it('refuses without credits before any provider work', async () => {
      const { brandedTextActions, credits, service } = createService({
        hasCredits: false,
      });

      const result = await service.refineText(params, headless);

      expect(result).toMatchObject({
        error: 'Not enough credits to generate content.',
        success: false,
      });
      expect(brandedTextActions.run).not.toHaveBeenCalled();
      expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
    });

    it('reports a stopped action without charging and keeps its code', async () => {
      const { brandedTextActions, credits, service } = createService();
      brandedTextActions.run.mockResolvedValue({
        code: 'limit_exceeded',
        kind: 'failed',
        message: 'The result did not fit.',
        receiptId: 'receipt-2',
      });

      const result = await service.refineText(params, headless);

      expect(result).toEqual({
        creditsUsed: 0,
        data: { code: 'limit_exceeded', receiptId: 'receipt-2' },
        error: 'The result did not fit.',
        success: false,
      });
      expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown mode', { mode: 'summarize' }, 'mode'],
      ['a missing request key', { requestKey: undefined }, 'requestKey'],
      ['a blank draft', { text: '   ' }, 'text'],
    ])('rejects %s', async (_label, patch, field) => {
      const { brandedTextActions, service } = createService();

      const result = await service.refineText(
        { ...params, ...patch },
        headless,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain(field);
      expect(brandedTextActions.run).not.toHaveBeenCalled();
    });

    it('requires a brand', async () => {
      const { brandedTextActions, service } = createService();

      const result = await service.refineText(
        { ...params, brandId: undefined },
        headless,
      );

      expect(result).toMatchObject({
        error: 'A brand is required to edit text.',
        success: false,
      });
      expect(brandedTextActions.run).not.toHaveBeenCalled();
    });
  });

  describe('generateReplyVariants', () => {
    const params = {
      brandId: 'brand-1',
      platform: 'twitter',
      postAuthor: '@ada',
      postContent: 'We just launched.',
      requestKey: '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c',
      tone: 'agree',
    };

    it('drafts the replies once with the post, author and tone and charges one flat draft', async () => {
      const { brandedTextActions, credits, service } = createService();

      const result = await service.generateReplyVariants(params, headless);

      expect(result).toMatchObject({
        creditsUsed: 2,
        data: { variants: ['One', 'Two'] },
        isBillingDelegated: true,
        success: true,
      });
      expect(
        brandedTextActions.draftReplyVariants,
      ).toHaveBeenCalledExactlyOnceWith({
        actor: { organizationId: 'org-1', userId: 'user-1' },
        brandId: 'brand-1',
        platform: 'twitter',
        postAuthor: '@ada',
        postContent: 'We just launched.',
        requestKey: params.requestKey,
        tone: 'agree',
        variants: 3,
      });
      expect(credits.deductCreditsFromOrganization).toHaveBeenCalledOnce();
      expect(credits.deductCreditsFromOrganization).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        2,
        expect.stringContaining('generate_reply_variants'),
        expect.anything(),
        { brandId: 'brand-1' },
      );
    });

    it('does not charge a replay of the same request key', async () => {
      const { brandedTextActions, credits, service } = createService();
      brandedTextActions.draftReplyVariants.mockResolvedValue({
        hasNewDispatch: false,
        kind: 'completed',
        result: { isReplayed: true, variants: ['One'] },
      });

      expect(
        await service.generateReplyVariants(params, headless),
      ).toMatchObject({ creditsUsed: 0, success: true });
      expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
    });

    it('refuses without credits before any model work', async () => {
      const { brandedTextActions, service } = createService({
        hasCredits: false,
      });

      expect(
        await service.generateReplyVariants(params, headless),
      ).toMatchObject({
        error: 'Not enough credits to generate content.',
        success: false,
      });
      expect(brandedTextActions.draftReplyVariants).not.toHaveBeenCalled();
    });

    it('reports a failed draft without charging', async () => {
      const { brandedTextActions, credits, service } = createService();
      brandedTextActions.draftReplyVariants.mockResolvedValue({
        code: 'no_usable_reply',
        kind: 'failed',
        message: 'The model gave no usable reply. Try again.',
      });

      expect(await service.generateReplyVariants(params, headless)).toEqual({
        creditsUsed: 0,
        data: { code: 'no_usable_reply' },
        error: 'The model gave no usable reply. Try again.',
        success: false,
      });
      expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown tone', { tone: 'friendly' }, 'tone'],
      ['too many variants', { variants: 9 }, 'variants'],
      ['an empty post', { postContent: '' }, 'postContent'],
    ])('rejects %s', async (_label, patch, field) => {
      const { brandedTextActions, service } = createService();

      const result = await service.generateReplyVariants(
        { ...params, ...patch },
        headless,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain(field);
      expect(brandedTextActions.draftReplyVariants).not.toHaveBeenCalled();
    });

    it('requires a brand', async () => {
      const { service } = createService();

      expect(
        await service.generateReplyVariants(
          { ...params, brandId: undefined },
          headless,
        ),
      ).toMatchObject({
        error: 'A brand is required to write replies.',
        success: false,
      });
    });
  });
});
