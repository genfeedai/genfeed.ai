import { AiActionType } from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { AgentMediaAssetGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-asset-generation.service';
import { AgentMediaBatchGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-batch-generation.service';
import { AgentMediaGenerationToolHandler } from '@api/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service';
import { AgentMediaTextGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-text-generation.service';
import { describe, expect, it, vi } from 'vitest';

function createHandler() {
  const aiActionsService = {
    execute: vi.fn(),
  };
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
  const logger = { error: vi.fn(), warn: vi.fn() };
  const handler = new AgentMediaGenerationToolHandler(
    new AgentMediaTextGenerationService(
      internalApi as never,
      aiActionsService as never,
      contentGeneratorService as never,
    ),
    new AgentMediaAssetGenerationService(
      logger as never,
      { ingredientsEndpoint: 'https://cdn.example.com/ingredients' } as never,
      internalApi as never,
      onboardingHandler as never,
    ),
    new AgentMediaBatchGenerationService(logger as never, {} as never),
  );

  return {
    aiActionsService,
    contentGeneratorService,
    handler,
    internalApi,
    onboardingHandler,
  };
}

const context = {
  brandId: 'brand-1',
  organizationId: 'organization-1',
  userId: 'user-1',
};

describe('AgentMediaGenerationToolHandler ownership', () => {
  it('routes each public media tool to exactly one family owner', async () => {
    const result = { creditsUsed: 0, success: true };
    const textGeneration = {
      aiAction: vi.fn().mockResolvedValue(result),
      generateContent: vi.fn().mockResolvedValue(result),
    };
    const assetGeneration = {
      generateAsIdentity: vi.fn().mockResolvedValue(result),
      generateImage: vi.fn().mockResolvedValue(result),
      generateMusic: vi.fn().mockResolvedValue(result),
      generateVideo: vi.fn().mockResolvedValue(result),
      generateVoice: vi.fn().mockResolvedValue(result),
      reframeImage: vi.fn().mockResolvedValue(result),
      upscaleImage: vi.fn().mockResolvedValue(result),
    };
    const batchGeneration = {
      generateContentBatch: vi.fn().mockResolvedValue(result),
    };
    const handler = new AgentMediaGenerationToolHandler(
      textGeneration as never,
      assetGeneration as never,
      batchGeneration as never,
    );
    const params = { prompt: 'A launch visual' };

    await handler.aiAction(params, context);
    await handler.generateContent(params, context);
    await handler.generateImage(params, context);
    await handler.reframeImage(params, context);
    await handler.upscaleImage(params, context);
    await handler.generateVideo(params, context);
    await handler.generateMusic(params, context);
    await handler.generateVoice(params, context);
    await handler.generateAsIdentity(params, context);
    await handler.generateContentBatch(params, context);

    expect(textGeneration.aiAction).toHaveBeenCalledWith(params, context);
    expect(textGeneration.generateContent).toHaveBeenCalledWith(
      params,
      context,
    );
    expect(assetGeneration.generateImage).toHaveBeenCalledWith(params, context);
    expect(assetGeneration.reframeImage).toHaveBeenCalledWith(params, context);
    expect(assetGeneration.upscaleImage).toHaveBeenCalledWith(params, context);
    expect(assetGeneration.generateVideo).toHaveBeenCalledWith(params, context);
    expect(assetGeneration.generateMusic).toHaveBeenCalledWith(params, context);
    expect(assetGeneration.generateVoice).toHaveBeenCalledWith(params, context);
    expect(assetGeneration.generateAsIdentity).toHaveBeenCalledWith(
      params,
      context,
    );
    expect(batchGeneration.generateContentBatch).toHaveBeenCalledWith(
      params,
      context,
    );
    for (const owner of [textGeneration, assetGeneration, batchGeneration]) {
      for (const method of Object.values(owner)) {
        expect(method).toHaveBeenCalledOnce();
      }
    }
  });
});

describe('AgentMediaGenerationToolHandler text previews', () => {
  it.each([
    ['adapt-platform', AiActionType.ADAPT_PLATFORM],
    ['add-hashtags', AiActionType.ADD_HASHTAGS],
    ['analytics-insight', AiActionType.ANALYTICS_INSIGHT],
    ['content-suggest', AiActionType.CONTENT_SUGGEST],
    ['enhance', AiActionType.ENHANCE_PROMPT],
    ['enhance-prompt', AiActionType.ENHANCE_PROMPT],
    ['expand', AiActionType.EXPAND],
    ['explain-metric', AiActionType.EXPLAIN_METRIC],
    ['grammar-check', AiActionType.GRAMMAR_CHECK],
    ['hashtags', AiActionType.ADD_HASHTAGS],
    ['hook-generator', AiActionType.HOOK_GENERATOR],
    ['rewrite', AiActionType.REWRITE],
    ['seo-optimize', AiActionType.SEO_OPTIMIZE],
    ['shorten', AiActionType.SHORTEN],
    ['suggest-keywords', AiActionType.SUGGEST_KEYWORDS],
    ['tone-adjust', AiActionType.TONE_ADJUST],
    ['translate', AiActionType.ADAPT_PLATFORM],
    ['unknown-action', AiActionType.ENHANCE_PROMPT],
  ])('maps %s to the preserved AI action', async (action, expectedAction) => {
    const { aiActionsService, handler } = createHandler();
    aiActionsService.execute.mockResolvedValue({
      result: 'Shorter copy',
      tokensUsed: 14,
    });

    const result = await handler.aiAction(
      { action, text: 'Long copy' },
      context,
    );

    expect(aiActionsService.execute).toHaveBeenCalledWith(
      'organization-1',
      expect.objectContaining({ action: expectedAction, content: 'Long copy' }),
    );
    expect(result).toEqual({
      creditsUsed: 1,
      data: { result: 'Shorter copy', tokensUsed: 14 },
      success: true,
    });
  });

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

  it('preserves avatar provider payloads and attachment ownership', async () => {
    const { handler, internalApi } = createHandler();
    internalApi.callInternalApi.mockResolvedValue({
      data: {
        attributes: { cdnUrl: 'https://cdn.example.com/avatar.mp4' },
        id: 'video-avatar-1',
      },
    });

    await handler.generateVideo(
      { audioUrl: 'https://cdn.example.com/voice.mp3', prompt: 'Say hello' },
      { ...context, attachmentUrls: ['https://cdn.example.com/avatar.png'] },
    );

    expect(internalApi.callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/v1/videos',
      expect.objectContaining({
        audioUrl: 'https://cdn.example.com/voice.mp3',
        brandId: 'brand-1',
        model: 'kwaivgi/kling-avatar-v2',
        references: ['https://cdn.example.com/avatar.png'],
      }),
      expect.objectContaining({ organizationId: 'organization-1' }),
    );
  });
});

describe('AgentMediaGenerationToolHandler direct asset families', () => {
  it.each([
    {
      endpoint: '/images/image-1/reframe',
      invoke: (handler: AgentMediaGenerationToolHandler) =>
        handler.reframeImage(
          { aspectRatio: '9:16', imageId: 'image-1' },
          context,
        ),
      response: {
        data: {
          attributes: { cdnUrl: 'https://cdn.example.com/reframed.png' },
          id: 'image-2',
        },
      },
      result: {
        data: { id: 'image-2', sourceImageId: 'image-1' },
        preview: { images: ['https://cdn.example.com/reframed.png'] },
      },
    },
    {
      endpoint: '/v1/images',
      invoke: (handler: AgentMediaGenerationToolHandler) =>
        handler.upscaleImage(
          { imageUrl: 'https://cdn.example.com/source.png' },
          context,
        ),
      response: {
        data: {
          attributes: { cdnUrl: 'https://cdn.example.com/upscaled.png' },
          id: 'image-upscaled-1',
        },
      },
      result: {
        data: { id: 'image-upscaled-1' },
        preview: { images: ['https://cdn.example.com/upscaled.png'] },
      },
    },
    {
      endpoint: '/v1/musics',
      invoke: (handler: AgentMediaGenerationToolHandler) =>
        handler.generateMusic(
          { duration: 20, text: 'bright synthwave' },
          context,
        ),
      response: {
        data: {
          attributes: { cdnUrl: 'https://cdn.example.com/music.mp3' },
          id: 'music-1',
        },
      },
      result: {
        data: { id: 'music-1' },
        preview: { audio: ['https://cdn.example.com/music.mp3'] },
      },
    },
    {
      endpoint: '/v1/voices/generate',
      invoke: (handler: AgentMediaGenerationToolHandler) =>
        handler.generateVoice(
          { text: 'Voice line', voiceId: 'voice-profile-1' },
          context,
        ),
      response: {
        data: {
          attributes: { audioUrl: 'https://cdn.example.com/voice.mp3' },
          id: 'voice-1',
        },
      },
      result: {
        data: { id: 'voice-1' },
        preview: { audio: ['https://cdn.example.com/voice.mp3'] },
      },
    },
    {
      endpoint: '/v1/videos/avatar',
      invoke: (handler: AgentMediaGenerationToolHandler) =>
        handler.generateAsIdentity({ text: 'Identity line' }, context),
      response: { data: { attributes: {}, id: 'identity-video-1' } },
      result: {
        data: { id: 'identity-video-1', status: 'processing' },
        preview: { title: 'Identity video generating' },
      },
    },
  ])(
    'preserves the $endpoint payload/result contract',
    async ({ endpoint, invoke, response, result }) => {
      const { handler, internalApi } = createHandler();
      internalApi.callInternalApi.mockResolvedValue(response);

      const output = await invoke(handler);

      expect(internalApi.callInternalApi).toHaveBeenCalledWith(
        'POST',
        endpoint,
        expect.any(Object),
        context,
      );
      expect(output.success).toBe(true);
      expect(output.data).toMatchObject(result.data);
      expect(output.nextActions?.[0]).toMatchObject(result.preview);
    },
  );
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

    const batchOwner = new AgentMediaBatchGenerationService(
      logger as never,
      {} as never,
      batchGenerationService as never,
      undefined,
      undefined,
      creditsUtilsService as never,
      batchCreditsService as never,
      undefined,
      batchGenerationQueueService as never,
    );
    const handler = new AgentMediaGenerationToolHandler(
      {} as never,
      {} as never,
      batchOwner,
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

  it('resolves a credential handle within the caller organization before creating the batch', async () => {
    const credentialsService = {
      findByHandle: vi.fn().mockResolvedValue({ brandId: 'brand-from-handle' }),
    };
    const batchGenerationService = {
      cancelBatch: vi.fn(),
      createBatch: vi.fn().mockResolvedValue({
        id: 'batch-handle-1',
        status: 'PENDING',
        totalCount: 1,
      }),
    };
    const queue = { queueBatch: vi.fn().mockResolvedValue('job-handle-1') };
    const batchOwner = new AgentMediaBatchGenerationService(
      { error: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      batchGenerationService as never,
      credentialsService as never,
      undefined,
      { deductCreditsFromOrganization: vi.fn() } as never,
      { recordUpfrontCharge: vi.fn() } as never,
      undefined,
      queue as never,
    );
    const handler = new AgentMediaGenerationToolHandler(
      {} as never,
      {} as never,
      batchOwner,
    );

    await handler.generateContentBatch(
      { count: 1, handle: '@creator', platforms: ['instagram'] },
      { ...context, brandId: undefined },
    );

    expect(credentialsService.findByHandle).toHaveBeenCalledWith(
      '@creator',
      'organization-1',
    );
    expect(batchGenerationService.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-from-handle' }),
      'user-1',
      'organization-1',
    );
  });

  it('runs and settles in process when no queue accepts ownership', async () => {
    const processBatch = vi.fn().mockResolvedValue({
      completedCount: 2,
      failedCount: 0,
      status: 'COMPLETED',
      totalCount: 2,
    });
    const settleBatchCredits = vi.fn().mockResolvedValue({
      settledCredits: 8,
    });
    const batchGenerationService = {
      cancelBatch: vi.fn(),
      createBatch: vi.fn().mockResolvedValue({
        id: 'batch-local-1',
        status: 'PENDING',
        totalCount: 2,
      }),
      processBatch,
    };
    const batchOwner = new AgentMediaBatchGenerationService(
      { error: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      batchGenerationService as never,
      undefined,
      undefined,
      { deductCreditsFromOrganization: vi.fn() } as never,
      {
        recordUpfrontCharge: vi.fn(),
        settleBatchCredits,
      } as never,
      undefined,
      { queueBatch: vi.fn().mockResolvedValue(undefined) } as never,
    );
    const handler = new AgentMediaGenerationToolHandler(
      {} as never,
      {} as never,
      batchOwner,
    );

    const result = await handler.generateContentBatch(
      { brandId: 'brand-1', count: 2, platforms: ['instagram'] },
      context,
    );
    await vi.waitFor(() => expect(settleBatchCredits).toHaveBeenCalledOnce());

    expect(result.success).toBe(true);
    expect(processBatch).toHaveBeenCalledWith(
      'batch-local-1',
      'organization-1',
      undefined,
    );
    expect(settleBatchCredits).toHaveBeenCalledWith({
      batchId: 'batch-local-1',
      organizationId: 'organization-1',
      userId: 'user-1',
    });
  });
});
