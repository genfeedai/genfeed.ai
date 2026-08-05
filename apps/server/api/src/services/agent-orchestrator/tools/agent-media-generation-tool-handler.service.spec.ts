import { AgentMediaGenerationToolHandler } from '@api/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service';
import { describe, expect, it, vi } from 'vitest';

function createHandler() {
  const contentGeneratorService = {
    generateContent: vi.fn(),
  };
  const internalApi = {
    callInternalApi: vi.fn(),
  };
  const handler = new AgentMediaGenerationToolHandler(
    { error: vi.fn(), warn: vi.fn() } as never,
    { ingredientsEndpoint: 'https://cdn.example.com/ingredients' } as never,
    internalApi as never,
    {} as never,
    contentGeneratorService as never,
    {} as never,
    {} as never,
  );

  return { contentGeneratorService, handler, internalApi };
}

const context = {
  brandId: 'brand-1',
  organizationId: 'organization-1',
  userId: 'user-1',
};

describe('AgentMediaGenerationToolHandler text previews', () => {
  it('emits a platform-aware output card for generated social content', async () => {
    const { contentGeneratorService, handler } = createHandler();
    contentGeneratorService.generateContent.mockResolvedValue([
      {
        content: 'Shipping is a feature. Momentum is the moat.',
        hashtags: [],
        hook: 'Shipping is a feature.',
        patternUsed: 'contrarian',
      },
    ]);

    const result = await handler.generateContent(
      { platform: 'twitter', topic: 'shipping velocity', type: 'post' },
      context,
    );

    expect(result.nextActions?.[0]).toMatchObject({
      contentFormat: 'social_post',
      platform: 'twitter',
      textContent: 'Shipping is a feature. Momentum is the moat.',
      type: 'content_preview_card',
    });
  });

  it('generates a durable newsletter and emits reader metadata', async () => {
    const { handler, internalApi } = createHandler();
    internalApi.callInternalApi.mockResolvedValue({
      data: {
        attributes: {
          content: '## Weekly signal\n\nThe important update.',
          label: 'The founder briefing',
          summary: 'The useful parts in three minutes.',
        },
        id: 'newsletter-1',
      },
    });

    const result = await handler.generateContent(
      { topic: 'AI content systems', type: 'newsletter' },
      context,
    );

    expect(internalApi.callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/v1/newsletters/generate-draft',
      expect.objectContaining({ topic: 'AI content systems' }),
      context,
    );
    expect(result.nextActions?.[0]).toMatchObject({
      contentFormat: 'newsletter',
      platform: 'newsletter',
      preheader: 'The useful parts in three minutes.',
      subject: 'The founder briefing',
      textContent: '## Weekly signal\n\nThe important update.',
      type: 'content_preview_card',
    });
  });

  it('emits the generated article body as a text preview', async () => {
    const { handler, internalApi } = createHandler();
    internalApi.callInternalApi.mockResolvedValue({
      data: {
        attributes: {
          content: '# Durable agents\n\nMake the output observable.',
          label: 'Durable agents',
        },
        id: 'article-1',
      },
    });

    const result = await handler.generateContent(
      { topic: 'agent architecture', type: 'article' },
      context,
    );

    expect(result.nextActions?.[0]).toMatchObject({
      contentFormat: 'article',
      textContent: '# Durable agents\n\nMake the output observable.',
      title: 'Durable agents',
      type: 'content_preview_card',
    });
  });
});
