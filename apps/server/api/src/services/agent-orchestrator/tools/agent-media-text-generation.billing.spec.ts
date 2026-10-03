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
  const service = new AgentMediaTextGenerationService(
    {} as never,
    contentGeneratorService as never,
    {} as never,
    generationGateway as never,
    brandsService as never,
    membersService as never,
    credits as never,
  );
  return { contentGeneratorService, credits, generationGateway, service };
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
});
