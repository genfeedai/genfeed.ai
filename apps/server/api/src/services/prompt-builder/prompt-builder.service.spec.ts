import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { CrunPromptBuilder } from '@api/services/prompt-builder/builders/crun-prompt.builder';
import { ReplicatePromptBuilder } from '@api/services/prompt-builder/builders/replicate-prompt.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockTemplatesService(
  overrides: Partial<TemplatesService> = {},
): TemplatesService {
  return {
    getPromptByKey: vi.fn().mockResolvedValue(null),
    getRenderedPrompt: vi.fn(),
    renderPrompt: vi.fn().mockReturnValue('rendered prompt text'),
    updateMetadata: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as TemplatesService;
}

function createMockReplicateBuilder(
  overrides: Partial<ReplicatePromptBuilder> = {},
): ReplicatePromptBuilder {
  return {
    buildPrompt: vi.fn().mockReturnValue({
      aspect_ratio: '16:9',
      prompt: 'built prompt',
    }),
    getProvider: vi.fn().mockReturnValue(ModelProvider.REPLICATE),
    supportsModel: vi.fn().mockReturnValue(true),
    ...overrides,
  } as unknown as ReplicatePromptBuilder;
}

describe('PromptBuilderService', () => {
  let service: PromptBuilderService;
  let templatesService: TemplatesService;
  let replicateBuilder: ReplicatePromptBuilder;

  beforeEach(async () => {
    templatesService = createMockTemplatesService();
    replicateBuilder = createMockReplicateBuilder();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptBuilderService,
        CrunPromptBuilder,
        { provide: LoggerService, useValue: createMockLogger() },
        { provide: TemplatesService, useValue: templatesService },
        {
          provide: ReplicatePromptBuilder,
          useValue: replicateBuilder,
        },
      ],
    }).compile();

    service = module.get<PromptBuilderService>(PromptBuilderService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildPrompt', () => {
    const baseParams: PromptBuilderParams = {
      modelCategory: ModelCategory.IMAGE,
      prompt: 'a sunset over mountains',
    };

    it('should return input from builder when no template found', async () => {
      const result = await service.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
        baseParams,
      );

      expect(result.input).toBeDefined();
      expect(replicateBuilder.buildPrompt).toHaveBeenCalled();
    });

    it('should use template when found and active', async () => {
      (
        templatesService.getPromptByKey as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        content: 'Template: {{prompt}} with style',
        isActive: true,
        version: 2,
      });

      const result = await service.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
        baseParams,
      );

      expect(templatesService.renderPrompt).toHaveBeenCalledWith(
        'Template: {{prompt}} with style',
        expect.objectContaining({ prompt: 'a sunset over mountains' }),
      );
      expect(result.templateUsed).toBeDefined();
      expect(result.templateVersion).toBe(2);
    });

    it('should increment template usage when template is used', async () => {
      (
        templatesService.getPromptByKey as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        content: 'template content',
        isActive: true,
        version: 1,
      });

      await service.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
        baseParams,
      );

      expect(templatesService.updateMetadata).toHaveBeenCalledWith(
        expect.any(String),
        { incrementUsage: true },
      );
    });

    it('should skip templates when useTemplate is false', async () => {
      await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
        ...baseParams,
        useTemplate: false,
      });

      expect(templatesService.getPromptByKey).not.toHaveBeenCalled();
    });

    it('should build brand context for non-TEXT models when branding enabled', async () => {
      (
        templatesService.getPromptByKey as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        content: 'Brand: {{brandName}}',
        isActive: true,
      });

      await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
        ...baseParams,
        brand: { label: 'MyBrand' },
        isBrandingEnabled: true,
      });

      // For non-TEXT, brand context is prepended to prompt
      expect(templatesService.getPromptByKey).toHaveBeenCalledWith(
        'system.brand-context',
      );
    });

    it('should build system prompt for TEXT models', async () => {
      // First call: category template lookup → null
      // Second call: system prompt template lookup → active template
      (templatesService.getPromptByKey as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // model-specific template
        .mockResolvedValueOnce(null) // category default
        .mockResolvedValueOnce({
          content: 'You are a helpful assistant',
          isActive: true,
        }); // system prompt

      const result = await service.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_GPT_5_2,
        {
          modelCategory: ModelCategory.TEXT,
          prompt: 'Explain AI',
        },
      );

      expect(result.systemPrompt).toBeDefined();
    });

    it('should use explicit systemPrompt when provided for TEXT models', async () => {
      const result = await service.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_GPT_5_2,
        {
          modelCategory: ModelCategory.TEXT,
          prompt: 'Explain AI',
          systemPrompt: 'Custom system prompt',
        },
      );

      expect(result.systemPrompt).toBe('Custom system prompt');
    });

    it('should fall back to provider-based builder when supportsModel returns false', async () => {
      (
        replicateBuilder.supportsModel as ReturnType<typeof vi.fn>
      ).mockReturnValue(false);

      // All models fall back to REPLICATE provider
      const result = await service.buildPrompt(
        'unknown/model' as string,
        baseParams,
      );

      expect(result.input).toBeDefined();
    });

    it('should include template variables for mood, style, camera', async () => {
      (
        templatesService.getPromptByKey as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        content: '{{mood}} {{style}} {{camera}}',
        isActive: true,
        version: 1,
      });

      await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
        ...baseParams,
        camera: 'wide angle',
        mood: 'dramatic',
        style: 'cinematic',
      });

      expect(templatesService.renderPrompt).toHaveBeenCalledWith(
        '{{mood}} {{style}} {{camera}}',
        expect.objectContaining({
          camera: 'wide angle',
          mood: 'dramatic',
          style: 'cinematic',
        }),
      );
    });

    describe('structured slots', () => {
      const sentPrompt = (): string =>
        (replicateBuilder.buildPrompt as ReturnType<typeof vi.fn>).mock
          .calls[0][2];

      it('writes the slots into the prompt as prose when no template places them', async () => {
        await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
          ...baseParams,
          camera: 'wide angle',
          lighting: 'golden hour',
          subject: 'a hiker',
        });

        expect(sentPrompt()).toBe(
          'a sunset over mountains. A hiker. Camera: wide angle. Lighting: golden hour.',
        );
      });

      it('leaves a slot to the template that already places it', async () => {
        (
          templatesService.getPromptByKey as ReturnType<typeof vi.fn>
        ).mockResolvedValueOnce({
          content: '{{{prompt}}} in a {{mood}} mood',
          isActive: true,
          version: 1,
        });
        (
          templatesService.renderPrompt as ReturnType<typeof vi.fn>
        ).mockReturnValueOnce('a sunset over mountains in a calm mood');

        await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
          ...baseParams,
          lens: '35mm',
          mood: 'calm',
        });

        expect(sentPrompt()).toBe(
          'a sunset over mountains in a calm mood. Lens: 35mm.',
        );
      });

      it('keeps audio slots for video unless audio is turned off', async () => {
        const video: PromptBuilderParams = {
          ...baseParams,
          modelCategory: ModelCategory.VIDEO,
          sounds: ['wind'],
        };

        await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, video);
        expect(sentPrompt()).toBe('a sunset over mountains. Audio: wind.');

        vi.mocked(replicateBuilder.buildPrompt).mockClear();
        await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
          ...video,
          isAudioEnabled: false,
        });
        expect(sentPrompt()).toBe('a sunset over mountains');
      });

      it('never renders audio slots for images', async () => {
        await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
          ...baseParams,
          sounds: ['wind'],
          speech: 'hello',
        });

        expect(sentPrompt()).toBe('a sunset over mountains');
      });

      it('sends the avoid list as a negative prompt, not as prose', async () => {
        await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
          ...baseParams,
          blacklist: ['text'],
        });

        expect(sentPrompt()).toBe('a sunset over mountains');
      });

      it('leaves the prompt alone when templates are off', async () => {
        await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
          ...baseParams,
          camera: 'wide angle',
          useTemplate: false,
        });

        expect(sentPrompt()).toBe('a sunset over mountains');
      });

      it('leaves text models alone', async () => {
        await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
          ...baseParams,
          camera: 'wide angle',
          modelCategory: ModelCategory.TEXT,
        });

        expect(sentPrompt()).toBe('a sunset over mountains');
      });
    });

    it('should not include optional fields when empty', async () => {
      (
        templatesService.getPromptByKey as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        content: 'template',
        isActive: true,
        version: 1,
      });

      await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
        ...baseParams,
        mood: '',
        style: undefined,
      });

      const renderCall = (
        templatesService.renderPrompt as ReturnType<typeof vi.fn>
      ).mock.calls[0][1];
      expect(renderCall.mood).toBeUndefined();
      expect(renderCall.style).toBeUndefined();
    });

    it('should skip preset keys and fall back to category default', async () => {
      (
        templatesService.getPromptByKey as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await service.buildPrompt(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3, {
        ...baseParams,
        promptTemplate: 'preset.cinematic',
      });

      // Should NOT try to look up 'preset.cinematic' as a template
      const calls = (
        templatesService.getPromptByKey as ReturnType<typeof vi.fn>
      ).mock.calls;
      const templateKeys = calls.map((call: [string, string?]) => call[0]);
      expect(templateKeys).not.toContain('preset.cinematic');
    });
  });

  describe('isModelSupported', () => {
    it('should return true for supported models', () => {
      expect(
        service.isModelSupported(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3),
      ).toBe(true);
    });

    it('should return true even for unknown models (fallback to REPLICATE)', () => {
      // All models route through Replicate as fallback
      (
        replicateBuilder.supportsModel as ReturnType<typeof vi.fn>
      ).mockReturnValue(false);

      // getProviderFromModelKey always returns REPLICATE, so builder is found
      expect(service.isModelSupported('unknown/model' as string)).toBe(true);
    });
  });

  describe('getProviderForModel', () => {
    it('should return REPLICATE for supported models', () => {
      expect(
        service.getProviderForModel(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3),
      ).toBe(ModelProvider.REPLICATE);
    });

    it('should fall back to REPLICATE for unknown models', () => {
      // All models route through Replicate as the universal fallback
      (
        replicateBuilder.supportsModel as ReturnType<typeof vi.fn>
      ).mockReturnValue(false);

      expect(service.getProviderForModel('unknown/model' as string)).toBe(
        ModelProvider.REPLICATE,
      );
    });
  });
});
