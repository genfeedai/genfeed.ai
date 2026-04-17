/**
 * @fileoverview Tests for AiInfluencerService
 * @description Comprehensive tests covering orchestration logic, persona loading,
 * caption generation, image generation, platform publishing, error handling, and scheduling.
 */

import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { ConfigService } from '@api/config/config.service';
import { AiInfluencerService } from '@api/services/ai-influencer/ai-influencer.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { PersonaContentService } from '@api/services/persona-content/persona-content.service';
import { LoraStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('AiInfluencerService', () => {
  let service: AiInfluencerService;
  let personasService: {
    findOne: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let ingredientsService: {
    create: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
  };
  let falService: { generateImage: ReturnType<typeof vi.fn> };
  let openRouterService: { chatCompletion: ReturnType<typeof vi.fn> };
  let instagramService: { uploadImage: ReturnType<typeof vi.fn> };
  let twitterService: { uploadMedia: ReturnType<typeof vi.fn> };
  let personaContentService: {
    generateVideo: ReturnType<typeof vi.fn>;
    generateVoice: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  // Test IDs
  const mockOrganizationId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const mockBrandId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const mockUserId = new Types.ObjectId('507f1f77bcf86cd799439013');
  const mockPersonaId = new Types.ObjectId('507f1f77bcf86cd799439014');
  const mockIngredientId = new Types.ObjectId('507f1f77bcf86cd799439015');

  // Mock persona
  const createMockPersona = (
    overrides: Partial<PersonaDocument> = {},
  ): PersonaDocument =>
    ({
      _id: mockPersonaId,
      bio: 'A lifestyle influencer sharing daily vibes',
      brand: mockBrandId,
      contentStrategy: {
        platforms: ['instagram', 'twitter'],
        tone: 'casual and fun',
        topics: ['fashion', 'travel', 'wellness'],
      },
      isDarkroomCharacter: true,
      isDeleted: false,
      label: 'Luna AI',
      loraModelPath: 's3://models/luna-lora.safetensors',
      loraStatus: LoraStatus.TRAINED,
      niche: 'lifestyle',
      organization: mockOrganizationId,
      slug: 'luna-ai',
      triggerWord: 'luna_trigger',
      user: mockUserId,
      ...overrides,
    }) as unknown as PersonaDocument;

  // Mock ingredient
  const createMockIngredient = (): IngredientDocument =>
    ({
      _id: mockIngredientId,
      brand: mockBrandId,
      cdnUrl: 'https://cdn.fal.ai/generated/test-image.jpg',
      organization: mockOrganizationId,
      persona: mockPersonaId,
      personaSlug: 'luna-ai',
      user: mockUserId,
    }) as unknown as IngredientDocument;

  // Mock LLM response
  const mockCaptionResponse = {
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content:
            'Living my best life ✨ Every day is a new adventure #lifestyle #vibes #travel',
          role: 'assistant',
        },
      },
    ],
    id: 'chatcmpl-test',
    usage: { completion_tokens: 20, prompt_tokens: 100, total_tokens: 120 },
  };

  beforeEach(async () => {
    personasService = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
    };

    ingredientsService = {
      create: vi.fn(),
      findAll: vi.fn(),
    };

    falService = {
      generateImage: vi.fn(),
    };

    openRouterService = {
      chatCompletion: vi.fn(),
    };

    instagramService = {
      uploadImage: vi.fn(),
    };

    twitterService = {
      uploadMedia: vi.fn(),
    };

    personaContentService = {
      generateVideo: vi.fn(),
      generateVoice: vi.fn(),
    };

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiInfluencerService,
        { provide: PersonasService, useValue: personasService },
        { provide: IngredientsService, useValue: ingredientsService },
        { provide: FalService, useValue: falService },
        { provide: OpenRouterService, useValue: openRouterService },
        { provide: InstagramService, useValue: instagramService },
        { provide: TwitterService, useValue: twitterService },
        { provide: PersonaContentService, useValue: personaContentService },
        { provide: ConfigService, useValue: { get: vi.fn() } },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<AiInfluencerService>(AiInfluencerService);
  });

  // ─── Persona Loading ────────────────────────────────────────────

  describe('loadPersona (via generateDailyPost)', () => {
    it('should throw NotFoundException when persona slug does not exist', async () => {
      personasService.findOne.mockResolvedValue(null);

      await expect(
        service.generateDailyPost('non-existent', ['instagram']),
      ).rejects.toThrow(NotFoundException);

      expect(personasService.findOne).toHaveBeenCalledWith({
        isDarkroomCharacter: true,
        isDeleted: false,
        slug: 'non-existent',
      });
    });

    it('should load persona successfully and proceed with pipeline', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({
        mediaId: 'ig-123',
        shortcode: 'ABC',
      });

      const result = await service.generateDailyPost('luna-ai', ['instagram']);

      expect(result.personaSlug).toBe('luna-ai');
      expect(personasService.findOne).toHaveBeenCalledWith({
        isDarkroomCharacter: true,
        isDeleted: false,
        slug: 'luna-ai',
      });
    });
  });

  // ─── Caption Generation ─────────────────────────────────────────

  describe('generateCaption', () => {
    it('should generate a caption using persona context', async () => {
      const persona = createMockPersona();
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);

      const caption = await service.generateCaption(persona);

      expect(caption).toBe(
        'Living my best life ✨ Every day is a new adventure #lifestyle #vibes #travel',
      );
      expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' }),
          ]),
          model: expect.any(String),
          temperature: expect.any(Number),
        }),
      );
    });

    it('should include persona topics in the system prompt', async () => {
      const persona = createMockPersona({
        contentStrategy: {
          tone: 'professional',
          topics: ['tech', 'AI', 'startups'],
        },
      });
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);

      await service.generateCaption(persona);

      const callArgs = openRouterService.chatCompletion.mock.calls[0][0];
      const systemMessage = callArgs.messages.find(
        (m: { role: string }) => m.role === 'system',
      );
      expect(systemMessage.content).toContain('tech');
      expect(systemMessage.content).toContain('AI');
      expect(systemMessage.content).toContain('startups');
    });

    it('should handle persona without content strategy gracefully', async () => {
      const persona = createMockPersona({ contentStrategy: undefined });
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);

      const caption = await service.generateCaption(persona);
      expect(caption).toBeTruthy();
    });

    it('should throw when LLM returns empty content', async () => {
      const persona = createMockPersona();
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: '', role: 'assistant' } }],
      });

      await expect(service.generateCaption(persona)).rejects.toThrow(
        'LLM returned empty caption',
      );
    });

    it('should throw when LLM returns null content', async () => {
      const persona = createMockPersona();
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: null, role: 'assistant' } }],
      });

      await expect(service.generateCaption(persona)).rejects.toThrow(
        'LLM returned empty caption',
      );
    });

    it('should truncate captions exceeding Instagram limit', async () => {
      const persona = createMockPersona();
      const longCaption = 'A'.repeat(2500);
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: longCaption, role: 'assistant' } }],
      });

      const caption = await service.generateCaption(persona);
      expect(caption.length).toBeLessThanOrEqual(2200);
      expect(caption.endsWith('...')).toBe(true);
    });
  });

  // ─── Image Generation ───────────────────────────────────────────

  describe('image generation (via generateDailyPost)', () => {
    it('should include LoRA in fal.ai request when persona has trained LoRA', async () => {
      const persona = createMockPersona({
        loraModelPath: 's3://models/luna-lora.safetensors',
        loraStatus: LoraStatus.TRAINED,
      });
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });

      await service.generateDailyPost('luna-ai', ['instagram']);

      expect(falService.generateImage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          loras: expect.arrayContaining([
            expect.objectContaining({
              path: 's3://models/luna-lora.safetensors',
            }),
          ]),
        }),
      );
    });

    it('should not include LoRA when persona has no trained model', async () => {
      const persona = createMockPersona({
        loraModelPath: undefined,
        loraStatus: LoraStatus.NONE,
      });
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });

      await service.generateDailyPost('luna-ai', ['instagram']);

      const falCallInput = falService.generateImage.mock.calls[0][1];
      expect(falCallInput.loras).toBeUndefined();
    });

    it('should use custom aspect ratio when provided', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });

      await service.generateDailyPost('luna-ai', ['instagram'], {
        aspectRatio: '4:5',
      });

      const falCallInput = falService.generateImage.mock.calls[0][1];
      expect(falCallInput.image_size.width).toBe(819);
      expect(falCallInput.image_size.height).toBe(1024);
    });

    it('should use prompt override when provided', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });

      await service.generateDailyPost('luna-ai', ['instagram'], {
        promptOverride: 'A custom photo prompt',
      });

      const falCallInput = falService.generateImage.mock.calls[0][1];
      expect(falCallInput.prompt).toBe('A custom photo prompt');
    });

    it('should propagate fal.ai errors', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockRejectedValue(
        new Error('GPU out of memory'),
      );

      await expect(
        service.generateDailyPost('luna-ai', ['instagram']),
      ).rejects.toThrow('GPU out of memory');
    });
  });

  // ─── Ingredient Creation ────────────────────────────────────────

  describe('ingredient creation (via generateDailyPost)', () => {
    it('should create ingredient record with correct data', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/generated-image.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });

      await service.generateDailyPost('luna-ai', ['instagram']);

      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: mockBrandId,
          cdnUrl: 'https://cdn.fal.ai/generated-image.jpg',
          generationSource: 'ai-influencer-luna-ai',
          organization: mockOrganizationId,
          persona: mockPersonaId,
          personaSlug: 'luna-ai',
          user: mockUserId,
        }),
      );
    });
  });

  // ─── Platform Publishing ────────────────────────────────────────

  describe('platform publishing', () => {
    it('should publish to Instagram and return result', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({
        mediaId: 'ig-media-456',
        shortcode: 'XYZ',
      });

      const result = await service.generateDailyPost('luna-ai', ['instagram']);

      expect(result.publishResults).toEqual([
        {
          externalId: 'ig-media-456',
          platform: 'instagram',
          status: 'published',
          success: true,
        },
      ]);
    });

    it('should publish to Twitter and return result', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      twitterService.uploadMedia.mockResolvedValue('tweet-789');

      const result = await service.generateDailyPost('luna-ai', ['twitter']);

      expect(result.publishResults).toEqual([
        {
          externalId: 'tweet-789',
          platform: 'twitter',
          status: 'published',
          success: true,
        },
      ]);
    });

    it('should publish to both platforms', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });
      twitterService.uploadMedia.mockResolvedValue('tweet-456');

      const result = await service.generateDailyPost('luna-ai', [
        'instagram',
        'twitter',
      ]);

      expect(result.publishResults).toHaveLength(2);
      expect(result.publishResults[0].platform).toBe('instagram');
      expect(result.publishResults[0].success).toBe(true);
      expect(result.publishResults[1].platform).toBe('twitter');
      expect(result.publishResults[1].success).toBe(true);
    });

    it('should handle Instagram publish failure gracefully', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockRejectedValue(
        new Error('Instagram API rate limit'),
      );

      const result = await service.generateDailyPost('luna-ai', ['instagram']);

      expect(result.publishResults).toEqual([
        {
          error: 'Instagram API rate limit',
          platform: 'instagram',
          status: 'failed',
          success: false,
        },
      ]);
    });

    it('should handle Twitter publish failure gracefully', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      twitterService.uploadMedia.mockRejectedValue(
        new Error('Twitter auth expired'),
      );

      const result = await service.generateDailyPost('luna-ai', ['twitter']);

      expect(result.publishResults).toEqual([
        {
          error: 'Twitter auth expired',
          platform: 'twitter',
          status: 'failed',
          success: false,
        },
      ]);
    });

    it('should continue publishing to other platforms when one fails', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockRejectedValue(new Error('IG failed'));
      twitterService.uploadMedia.mockResolvedValue('tweet-ok');

      const result = await service.generateDailyPost('luna-ai', [
        'instagram',
        'twitter',
      ]);

      expect(result.publishResults).toHaveLength(2);
      expect(result.publishResults[0].success).toBe(false);
      expect(result.publishResults[1].success).toBe(true);
    });

    it('should filter out unsupported platforms', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });
      personaContentService.generateVoice.mockResolvedValue({
        provider: 'elevenlabs',
        status: 'completed',
        url: 'https://cdn.audio/test.mp3',
      });
      personaContentService.generateVideo.mockResolvedValue({
        jobId: 'video-job-123',
        provider: 'heygen',
        status: 'queued',
      });

      const result = await service.generateDailyPost('luna-ai', [
        'instagram',
        'tiktok',
        'facebook',
      ]);

      // Facebook is filtered out; Instagram publishes immediately and TikTok queues video output.
      expect(result.publishResults).toHaveLength(2);
      expect(result.publishResults[0].platform).toBe('instagram');
      expect(result.publishResults[1]).toEqual({
        externalId: 'video-job-123',
        platform: 'tiktok',
        status: 'queued',
        success: true,
      });
    });

    it('should throw when no supported platforms are provided', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);

      await expect(
        service.generateDailyPost('luna-ai', ['facebook', 'threads']),
      ).rejects.toThrow('No supported platforms provided');
    });

    it('should queue voice and video generation for video-first platforms', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      personaContentService.generateVoice.mockResolvedValue({
        provider: 'elevenlabs',
        status: 'completed',
        url: 'https://cdn.audio/test.mp3',
      });
      personaContentService.generateVideo.mockResolvedValue({
        jobId: 'video-job-123',
        provider: 'heygen',
        status: 'queued',
      });

      const result = await service.generateDailyPost('luna-ai', [
        'tiktok',
        'youtube',
      ]);

      expect(personaContentService.generateVoice).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredientId: mockIngredientId,
          organization: mockOrganizationId,
          personaId: mockPersonaId,
          user: mockUserId,
        }),
      );
      expect(personaContentService.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          aspectRatio: '9:16',
          organization: mockOrganizationId,
          personaId: mockPersonaId,
          script: expect.any(String),
          user: mockUserId,
        }),
      );
      expect(result.voiceResult).toEqual({
        provider: 'elevenlabs',
        status: 'completed',
        url: 'https://cdn.audio/test.mp3',
      });
      expect(result.videoResult).toEqual({
        jobId: 'video-job-123',
        provider: 'heygen',
        status: 'queued',
      });
      expect(result.publishResults).toEqual([
        {
          externalId: 'video-job-123',
          platform: 'tiktok',
          status: 'queued',
          success: true,
        },
        {
          externalId: 'video-job-123',
          platform: 'youtube',
          status: 'queued',
          success: true,
        },
      ]);
    });
  });

  // ─── Full Pipeline ──────────────────────────────────────────────

  describe('generateDailyPost (full pipeline)', () => {
    it('should return complete result with all fields', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/generated.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });
      twitterService.uploadMedia.mockResolvedValue('tweet-456');

      const result = await service.generateDailyPost('luna-ai', [
        'instagram',
        'twitter',
      ]);

      expect(result).toEqual(
        expect.objectContaining({
          caption: expect.any(String),
          imageUrl: 'https://cdn.fal.ai/generated.jpg',
          ingredientId: mockIngredientId.toString(),
          personaSlug: 'luna-ai',
          publishResults: expect.arrayContaining([
            expect.objectContaining({ platform: 'instagram', success: true }),
            expect.objectContaining({ platform: 'twitter', success: true }),
          ]),
        }),
      );
    });

    it('should use caption override when provided', async () => {
      const persona = createMockPersona();
      personasService.findOne.mockResolvedValue(persona);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });

      const result = await service.generateDailyPost('luna-ai', ['instagram'], {
        captionOverride: 'My custom caption #test',
      });

      expect(result.caption).toBe('My custom caption #test');
      // Should NOT call LLM when caption is overridden
      expect(openRouterService.chatCompletion).not.toHaveBeenCalled();
    });
  });

  // ─── Schedule Daily Posts ───────────────────────────────────────

  describe('scheduleDailyPosts', () => {
    it('should find all autopilot personas and generate posts', async () => {
      const persona1 = createMockPersona({ slug: 'persona-1' });
      const persona2 = createMockPersona({
        _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
        slug: 'persona-2',
      });

      personasService.findAll.mockResolvedValue({
        docs: [persona1, persona2],
        limit: 100,
        page: 1,
        totalDocs: 2,
      });

      // Mock the full pipeline for each persona
      personasService.findOne
        .mockResolvedValueOnce(persona1)
        .mockResolvedValueOnce(persona2);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });
      twitterService.uploadMedia.mockResolvedValue('tweet-456');
      personasService.patch.mockResolvedValue({});

      const results = await service.scheduleDailyPosts();

      expect(results).toHaveLength(2);
      expect(personasService.findAll).toHaveBeenCalledWith(
        [
          {
            $match: {
              isAutopilotEnabled: true,
              isDarkroomCharacter: true,
              isDeleted: false,
            },
          },
        ],
        { limit: 100, page: 1 },
      );
    });

    it('should skip personas without slugs', async () => {
      const personaNoSlug = createMockPersona({ slug: undefined });

      personasService.findAll.mockResolvedValue({
        docs: [personaNoSlug],
        limit: 100,
        page: 1,
        totalDocs: 1,
      });

      const results = await service.scheduleDailyPosts();

      expect(results).toHaveLength(0);
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('should continue with other personas when one fails', async () => {
      const persona1 = createMockPersona({ slug: 'persona-fail' });
      const persona2 = createMockPersona({
        _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
        slug: 'persona-ok',
      });

      personasService.findAll.mockResolvedValue({
        docs: [persona1, persona2],
        limit: 100,
        page: 1,
        totalDocs: 2,
      });

      // First persona fails, second succeeds
      personasService.findOne
        .mockResolvedValueOnce(null) // fails - not found
        .mockResolvedValueOnce(persona2);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });
      twitterService.uploadMedia.mockResolvedValue('tweet-456');
      personasService.patch.mockResolvedValue({});

      const results = await service.scheduleDailyPosts();

      // Only persona2 should succeed
      expect(results).toHaveLength(1);
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should update lastAutopilotRunAt after successful generation', async () => {
      const persona = createMockPersona({ slug: 'persona-1' });

      personasService.findAll.mockResolvedValue({
        docs: [persona],
        limit: 100,
        page: 1,
        totalDocs: 1,
      });

      personasService.findOne.mockResolvedValue(persona);
      openRouterService.chatCompletion.mockResolvedValue(mockCaptionResponse);
      falService.generateImage.mockResolvedValue({
        url: 'https://cdn.fal.ai/test.jpg',
      });
      ingredientsService.create.mockResolvedValue(createMockIngredient());
      instagramService.uploadImage.mockResolvedValue({ mediaId: 'ig-123' });
      twitterService.uploadMedia.mockResolvedValue('tweet-456');
      personasService.patch.mockResolvedValue({});

      await service.scheduleDailyPosts();

      expect(personasService.patch).toHaveBeenCalledWith(
        mockPersonaId.toString(),
        expect.objectContaining({
          lastAutopilotRunAt: expect.any(Date),
        }),
      );
    });

    it('should return empty array when no autopilot personas exist', async () => {
      personasService.findAll.mockResolvedValue({
        docs: [],
        limit: 100,
        page: 1,
        totalDocs: 0,
      });

      const results = await service.scheduleDailyPosts();

      expect(results).toHaveLength(0);
    });
  });

  // ─── List Posts ─────────────────────────────────────────────────

  describe('listPosts', () => {
    it('should query ingredients with ai-influencer generation source', async () => {
      ingredientsService.findAll.mockResolvedValue({
        docs: [createMockIngredient()],
        limit: 20,
        page: 1,
        totalDocs: 1,
      });

      const result = await service.listPosts({});

      expect(ingredientsService.findAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              generationSource: { $regex: /^ai-influencer/ },
              isDeleted: false,
            }),
          }),
        ]),
        { limit: 20, page: 1 },
      );

      expect(result.docs).toHaveLength(1);
      expect(result.totalDocs).toBe(1);
    });

    it('should apply personaSlug filter when provided', async () => {
      ingredientsService.findAll.mockResolvedValue({
        docs: [],
        limit: 20,
        page: 1,
        totalDocs: 0,
      });

      await service.listPosts({ personaSlug: 'luna-ai' });

      expect(ingredientsService.findAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              personaSlug: 'luna-ai',
            }),
          }),
        ]),
        expect.anything(),
      );
    });

    it('should respect pagination parameters', async () => {
      ingredientsService.findAll.mockResolvedValue({
        docs: [],
        limit: 10,
        page: 3,
        totalDocs: 25,
      });

      await service.listPosts({ limit: 10, page: 3 });

      expect(ingredientsService.findAll).toHaveBeenCalledWith(
        expect.anything(),
        { limit: 10, page: 3 },
      );
    });
  });
});
