import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { LeonardoAIService } from '@api/services/integrations/leonardoai/leonardoai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { ImageGenerationHandler } from '@api/services/skill-executor/handlers/image-generation.handler';
import { ImageTaskModel } from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('ImageGenerationHandler', () => {
  let handler: ImageGenerationHandler;

  const mockByokProviderFactoryService = {
    resolveProvider: vi.fn(),
  };

  const mockFalService = {
    generateImage: vi.fn(),
  };

  const mockLeonardoService = {
    generateImage: vi.fn(),
  };

  const mockReplicateService = {
    runModel: vi.fn(),
  };

  const baseContext = {
    brandId: 'test-object-id',
    brandVoice: 'voice',
    organizationId: 'test-object-id',
    platforms: ['instagram'],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageGenerationHandler,
        {
          provide: ByokProviderFactoryService,
          useValue: mockByokProviderFactoryService,
        },
        { provide: FalService, useValue: mockFalService },
        { provide: LeonardoAIService, useValue: mockLeonardoService },
        { provide: ReplicateService, useValue: mockReplicateService },
      ],
    }).compile();

    handler = module.get(ImageGenerationHandler);
  });

  it('generates image draft from FAL model', async () => {
    mockByokProviderFactoryService.resolveProvider.mockResolvedValue({
      apiKey: 'fal-key',
      source: 'byok',
    });
    mockFalService.generateImage.mockResolvedValue({
      url: 'https://img.test/1.jpg',
    });

    const result = await handler.execute(baseContext, {
      model: ImageTaskModel.FAL,
      prompt: 'cyberpunk city',
    });

    expect(result.mediaUrls).toEqual(['https://img.test/1.jpg']);
    expect(result.skillSlug).toBe('image-generation');
    expect(result.type).toBe('image');
  });

  it('generates image draft from Leonardo model', async () => {
    mockByokProviderFactoryService.resolveProvider.mockResolvedValue({
      apiKey: 'leo-key',
      source: 'byok',
    });
    mockLeonardoService.generateImage.mockResolvedValue({
      url: 'https://img.test/leo.jpg',
    });

    const result = await handler.execute(baseContext, {
      model: ImageTaskModel.LEONARDO,
      prompt: 'sunset landscape',
    });

    expect(result.mediaUrls).toEqual(['https://img.test/leo.jpg']);
    expect(result.metadata).toEqual(
      expect.objectContaining({ model: ImageTaskModel.LEONARDO }),
    );
  });

  it('generates image draft from Replicate/SDXL model', async () => {
    mockByokProviderFactoryService.resolveProvider.mockResolvedValue({
      apiKey: 'rep-key',
      source: 'byok',
    });
    mockReplicateService.runModel.mockResolvedValue(
      'https://img.test/sdxl.jpg',
    );

    const result = await handler.execute(baseContext, {
      model: ImageTaskModel.SDXL,
      prompt: 'abstract art',
    });

    expect(result.mediaUrls).toEqual(['https://img.test/sdxl.jpg']);
  });

  it('throws when prompt is missing', async () => {
    await expect(handler.execute(baseContext, {})).rejects.toThrow(
      'image-generation requires a prompt',
    );
  });

  it('propagates provider resolution error', async () => {
    mockByokProviderFactoryService.resolveProvider.mockRejectedValue(
      new Error('No API key configured for fal'),
    );

    await expect(
      handler.execute(baseContext, {
        model: ImageTaskModel.FAL,
        prompt: 'test prompt',
      }),
    ).rejects.toThrow('No API key configured for fal');
  });

  it('propagates non-capacity FAL service error', async () => {
    mockByokProviderFactoryService.resolveProvider.mockResolvedValue({
      apiKey: 'fal-key',
      source: 'byok',
    });
    mockFalService.generateImage.mockRejectedValue(
      new Error('Invalid API key'),
    );

    await expect(
      handler.execute(baseContext, {
        model: ImageTaskModel.FAL,
        prompt: 'test prompt',
      }),
    ).rejects.toThrow('Invalid API key');
  });

  it('fails over from Replicate to fal.ai on capacity error', async () => {
    mockByokProviderFactoryService.resolveProvider.mockResolvedValue({
      apiKey: 'key',
      source: 'byok',
    });
    const capacityError = new Error(
      'Service is currently unavailable due to high demand',
    );
    Object.assign(capacityError, { code: 'E003' });
    mockReplicateService.runModel.mockRejectedValue(capacityError);
    mockFalService.generateImage.mockResolvedValue({
      url: 'https://img.test/fallback.jpg',
    });

    const result = await handler.execute(baseContext, {
      model: ImageTaskModel.SDXL,
      prompt: 'failover test',
    });

    expect(result.mediaUrls).toEqual(['https://img.test/fallback.jpg']);
    expect(result.metadata).toEqual(
      expect.objectContaining({
        fallbackUsed: true,
        resolvedProvider: ImageTaskModel.FAL,
      }),
    );
  });

  it('fails over from fal.ai to Replicate on capacity error', async () => {
    mockByokProviderFactoryService.resolveProvider.mockResolvedValue({
      apiKey: 'key',
      source: 'byok',
    });
    const capacityError = new Error('rate limit exceeded');
    Object.assign(capacityError, { status: 429 });
    mockFalService.generateImage.mockRejectedValue(capacityError);
    mockReplicateService.runModel.mockResolvedValue(
      'https://img.test/rep-fallback.jpg',
    );

    const result = await handler.execute(baseContext, {
      model: ImageTaskModel.FAL,
      prompt: 'fal failover test',
    });

    expect(result.mediaUrls).toEqual(['https://img.test/rep-fallback.jpg']);
    expect(result.metadata).toEqual(
      expect.objectContaining({
        fallbackUsed: true,
        resolvedProvider: ImageTaskModel.REPLICATE,
      }),
    );
  });

  it('defaults to FAL when model param is not provided', async () => {
    mockByokProviderFactoryService.resolveProvider.mockResolvedValue({
      source: 'hosted',
    });
    mockFalService.generateImage.mockResolvedValue({
      url: 'https://img.test/default.jpg',
    });

    const result = await handler.execute(baseContext, {
      prompt: 'default model test',
    });

    expect(result.mediaUrls).toEqual(['https://img.test/default.jpg']);
    expect(mockFalService.generateImage).toHaveBeenCalled();
    expect(mockLeonardoService.generateImage).not.toHaveBeenCalled();
    expect(mockReplicateService.runModel).not.toHaveBeenCalled();
  });
});
