import { AgentMediaGenerationToolHandler } from '@api/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service';
import { describe, expect, it, vi } from 'vitest';

function createHandler() {
  const contentGeneratorService = {
    generateContent: vi.fn(),
  };
  const internalApi = {
    callInternalApi: vi.fn(),
  };
  const onboardingHandler = {
    checkOnboardingStatus: vi.fn().mockResolvedValue({ nextActions: [] }),
    completeJourneyMission: vi.fn().mockResolvedValue(undefined),
  };
  const handler = new AgentMediaGenerationToolHandler(
    { error: vi.fn(), warn: vi.fn() } as never,
    { ingredientsEndpoint: 'https://cdn.example.com/ingredients' } as never,
    internalApi as never,
    {} as never,
    contentGeneratorService as never,
    onboardingHandler as never,
    {} as never,
  );

  return { contentGeneratorService, handler, internalApi, onboardingHandler };
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

  it('preserves generated thread segments as one structured preview', async () => {
    const { contentGeneratorService, handler } = createHandler();
    contentGeneratorService.generateContent.mockResolvedValue([
      {
        content:
          'The first post hooks the reader.\n\nThe second post delivers the proof.\n\nThe final post closes the loop.',
        hashtags: [],
        patternUsed: 'thread',
      },
    ]);

    const result = await handler.generateContent(
      { platform: 'twitter', topic: 'durable agents', type: 'thread' },
      context,
    );

    expect(result.nextActions?.[0]).toMatchObject({
      contentFormat: 'thread',
      platform: 'twitter',
      textContent: 'The first post hooks the reader.',
      tweets: [
        'The first post hooks the reader.',
        'The second post delivers the proof.',
        'The final post closes the loop.',
      ],
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

  it('generates standard articles through POST /v1/articles/generations', async () => {
    const { handler, internalApi } = createHandler();
    internalApi.callInternalApi.mockResolvedValue({ data: [] });

    await handler.generateContent(
      { topic: 'agent architecture', type: 'article' },
      context,
    );

    expect(internalApi.callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/v1/articles/generations',
      expect.objectContaining({
        count: 1,
        prompt: 'agent architecture',
        type: 'standard',
      }),
      context,
    );
  });

  it('generates long-form X articles with the x-article generation type', async () => {
    const { handler, internalApi } = createHandler();
    internalApi.callInternalApi.mockResolvedValue({ data: [] });

    await handler.generateContent(
      {
        targetWordCount: 3000,
        tone: 'analytical',
        topic: 'agent evaluation',
        type: 'x-article',
      },
      context,
    );

    expect(internalApi.callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/v1/articles/generations',
      expect.objectContaining({
        generateHeaderImage: true,
        prompt: 'agent evaluation',
        targetWordCount: 3000,
        tone: 'analytical',
        type: 'x-article',
      }),
      context,
    );
  });

  it('reads the first resource when the route answers with a collection', async () => {
    const { handler, internalApi } = createHandler();
    // `type: 'standard'` is serialized as a JSON:API collection, so the handler
    // has to unwrap `data[0]` rather than `data`.
    internalApi.callInternalApi.mockResolvedValue({
      data: [
        {
          attributes: {
            content: '# Durable agents\n\nMake the output observable.',
            label: 'Durable agents',
          },
          id: 'article-1',
        },
      ],
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

describe('AgentMediaGenerationToolHandler generateImage', () => {
  it('does not claim success with a blank preview when generation errors', async () => {
    const { handler, internalApi } = createHandler();
    internalApi.callInternalApi.mockRejectedValue(
      new Error('Polling timed out after 180s'),
    );

    const result = await handler.generateImage(
      { prompt: 'logo for genfeed.ai' },
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Polling timed out');
    expect(result.nextActions?.[0]).toMatchObject({
      title: 'Image not ready',
      type: 'completion_summary_card',
    });
    expect(result.nextActions?.[0]).not.toMatchObject({
      type: 'content_preview_card',
    });
  });

  it('does not claim success when the API returns no CDN URL', async () => {
    const { handler, internalApi } = createHandler();
    internalApi.callInternalApi.mockResolvedValue({
      data: { attributes: {}, id: 'ingredient-1' },
    });

    const result = await handler.generateImage(
      { prompt: 'logo for genfeed.ai' },
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/CDN URL|asset id/i);
  });

  it('forwards the thread scope brandId to POST /v1/images', async () => {
    const { handler, internalApi } = createHandler();
    internalApi.callInternalApi.mockResolvedValue({
      data: {
        attributes: {
          cdnUrl: 'https://cdn.example.com/logo.png',
        },
        id: 'ingredient-1',
      },
    });

    await handler.generateImage({ prompt: 'red apple' }, context);

    expect(internalApi.callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/v1/images',
      expect.objectContaining({
        autoSelectModel: true,
        brandId: 'brand-1',
        text: expect.any(String),
      }),
      context,
    );
  });

  it('forwards the requested output count to POST /v1/images', async () => {
    const { handler, internalApi } = createHandler();
    internalApi.callInternalApi.mockResolvedValue({
      data: {
        attributes: {
          cdnUrl: 'https://cdn.example.com/logo.png',
        },
        id: 'ingredient-1',
      },
    });

    await handler.generateImage(
      { outputs: 3, prompt: 'logo for genfeed.ai' },
      context,
    );

    expect(internalApi.callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/v1/images',
      expect.objectContaining({
        outputs: 3,
        text: expect.any(String),
      }),
      context,
    );
  });

  it('returns a content preview only when a CDN URL is present', async () => {
    const { handler, internalApi, onboardingHandler } = createHandler();
    internalApi.callInternalApi.mockResolvedValue({
      data: {
        attributes: {
          cdnUrl: 'https://cdn.example.com/logo.png',
        },
        id: 'ingredient-1',
      },
    });

    const result = await handler.generateImage(
      { prompt: 'logo for genfeed.ai' },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toMatchObject({
      images: ['https://cdn.example.com/logo.png'],
      title: 'Image generated',
      type: 'content_preview_card',
    });
    expect(onboardingHandler.completeJourneyMission).toHaveBeenCalled();
  });
});

describe('AgentMediaGenerationToolHandler generateVideo', () => {
  it('forwards the thread scope brandId to POST /v1/videos', async () => {
    const { handler, internalApi } = createHandler();
    internalApi.callInternalApi.mockResolvedValue({
      data: {
        attributes: {
          cdnUrl: 'https://cdn.example.com/clip.mp4',
        },
        id: 'video-1',
      },
    });

    await handler.generateVideo({ prompt: 'red apple' }, context);

    expect(internalApi.callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/v1/videos',
      expect.objectContaining({
        autoSelectModel: true,
        brandId: 'brand-1',
        text: expect.any(String),
      }),
      context,
    );
  });
});

describe('AgentMediaGenerationToolHandler generateContentBatch (#2696)', () => {
  function createBatchHandler() {
    const logger = { error: vi.fn(), warn: vi.fn() };
    const batchGenerationService = {
      cancelBatch: vi
        .fn()
        .mockResolvedValue({ id: 'batch-1', status: 'CANCELLED' }),
      createBatch: vi.fn().mockResolvedValue({
        id: 'batch-1',
        status: 'PENDING',
        totalCount: 3,
      }),
    };
    const creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    };
    const batchCreditsService = {
      recordUpfrontCharge: vi.fn().mockResolvedValue(undefined),
      settleBatchCredits: vi.fn().mockResolvedValue({ settledCredits: 12 }),
    };
    const batchGenerationQueueService = {
      queueBatch: vi.fn().mockResolvedValue('job-1'),
    };

    const handler = new AgentMediaGenerationToolHandler(
      logger as never,
      { ingredientsEndpoint: 'https://cdn.example.com/ingredients' } as never,
      { callInternalApi: vi.fn() } as never,
      {} as never,
      { generateContent: vi.fn() } as never,
      {
        checkOnboardingStatus: vi.fn(),
        completeJourneyMission: vi.fn(),
      } as never,
      {} as never,
      batchGenerationService as never,
      undefined,
      undefined,
      undefined,
      creditsUtilsService as never,
      batchCreditsService as never,
      undefined,
      batchGenerationQueueService as never,
    );

    return {
      batchCreditsService,
      batchGenerationQueueService,
      batchGenerationService,
      creditsUtilsService,
      handler,
      logger,
    };
  }

  it('returns early when batch generation is not wired', async () => {
    const { handler } = createHandler();

    const result = await handler.generateContentBatch(
      { count: 3, platforms: ['instagram'] },
      context,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      error: 'Batch generation service not available',
      success: false,
    });
  });

  it('does not reserve credits when createBatch rejects invalid platforms', async () => {
    const { batchGenerationService, creditsUtilsService, handler } =
      createBatchHandler();
    batchGenerationService.createBatch.mockRejectedValue(
      new Error('Invalid batch platform(s): myspace'),
    );

    const result = await handler.generateContentBatch(
      { count: 3, platforms: ['myspace'] },
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid batch platform/);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(batchGenerationService.cancelBatch).not.toHaveBeenCalled();
  });

  it('cancels the batch when the credit reserve fails after create', async () => {
    const {
      batchCreditsService,
      batchGenerationQueueService,
      batchGenerationService,
      creditsUtilsService,
      handler,
    } = createBatchHandler();
    creditsUtilsService.deductCreditsFromOrganization.mockRejectedValue(
      new Error('Insufficient credits'),
    );

    const result = await handler.generateContentBatch(
      {
        brandId: 'brand-1',
        count: 3,
        platforms: ['instagram'],
      },
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Insufficient credits/);
    expect(result.creditsUsed).toBe(0);
    expect(batchGenerationService.createBatch).toHaveBeenCalled();
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'organization-1',
      'user-1',
      expect.any(Number),
      'Batch generation batch-1',
      expect.anything(),
      {
        referenceId: 'batch-1',
        referenceType: 'batch-generation:upfront',
      },
    );
    expect(batchGenerationService.cancelBatch).toHaveBeenCalledWith(
      'batch-1',
      'organization-1',
    );
    expect(batchCreditsService.recordUpfrontCharge).not.toHaveBeenCalled();
    expect(batchGenerationQueueService.queueBatch).not.toHaveBeenCalled();
  });

  it('still returns the credit error when cancel after reserve failure also fails', async () => {
    const { batchGenerationService, creditsUtilsService, handler, logger } =
      createBatchHandler();
    creditsUtilsService.deductCreditsFromOrganization.mockRejectedValue(
      new Error('Insufficient credits'),
    );
    batchGenerationService.cancelBatch.mockRejectedValue(
      new Error('cancel failed'),
    );

    const result = await handler.generateContentBatch(
      { brandId: 'brand-1', count: 2, platforms: ['twitter'] },
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Insufficient credits/);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'failed to cancel batch after credit reserve failure',
      ),
      expect.objectContaining({ batchId: 'batch-1' }),
    );
  });

  it('reserves credits, pins the ledger, and queues the batch on the async path', async () => {
    const {
      batchCreditsService,
      batchGenerationQueueService,
      batchGenerationService,
      creditsUtilsService,
      handler,
    } = createBatchHandler();

    const result = await handler.generateContentBatch(
      {
        brandId: 'brand-1',
        count: 3,
        platforms: ['instagram'],
      },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.isBillingDelegated).toBe(true);
    expect(result.data).toMatchObject({
      batchId: 'batch-1',
      totalCount: 3,
    });
    expect(result.creditsUsed).toBeGreaterThan(0);
    expect(batchGenerationService.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        count: 3,
        platforms: ['instagram'],
      }),
      'user-1',
      'organization-1',
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalled();
    expect(batchCreditsService.recordUpfrontCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: 'batch-1',
        organizationId: 'organization-1',
      }),
    );
    expect(batchGenerationQueueService.queueBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: 'batch-1',
        organizationId: 'organization-1',
        userId: 'user-1',
      }),
    );
    // Settlement is deferred to the worker on the async path.
    expect(batchCreditsService.settleBatchCredits).not.toHaveBeenCalled();
  });
});
