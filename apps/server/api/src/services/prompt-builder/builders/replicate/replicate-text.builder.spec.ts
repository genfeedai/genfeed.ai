vi.mock('@genfeedai/helpers', async () => ({
  ...(await vi.importActual('@genfeedai/helpers')),
  calculateAspectRatio: vi.fn((w?: number, h?: number) => {
    if (!w || !h) return null;
    if (w > h) return '16:9';
    if (h > w) return '9:16';
    return '1:1';
  }),
  getDefaultAspectRatio: vi.fn(() => '16:9'),
}));

import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { ReplicateTextBuilder } from '@api/services/prompt-builder/builders/replicate/replicate-text.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import { ModelCategory, ModelKey } from '@genfeedai/enums';

const makeParams = (
  overrides: Partial<PromptBuilderParams> = {},
): PromptBuilderParams => ({
  modelCategory: ModelCategory.TEXT,
  prompt: 'Hello world',
  ...overrides,
});

type AnyInput = Record<string, unknown>;

describe('ReplicateTextBuilder', () => {
  let builder: ReplicateTextBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    builder = new ReplicateTextBuilder();
  });

  // ─── getSupportedModels ─────────────────────────────────────────────────────

  describe('getSupportedModels', () => {
    it('returns all supported text models', () => {
      const models = builder.getSupportedModels();
      expect(models).toContain(DEFAULT_TEXT_MODEL);
      expect(models).toContain(ModelKey.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1);
      expect(models).toContain(ModelKey.REPLICATE_OPENAI_GPT_5_2);
      expect(models).toContain(ModelKey.REPLICATE_OPENAI_GPT_IMAGE_1_5);
      expect(models).toContain(ModelKey.REPLICATE_GOOGLE_GEMINI_2_5_FLASH);
      expect(models).toContain(ModelKey.REPLICATE_GOOGLE_GEMINI_3_PRO);
      expect(models).toContain(ModelKey.REPLICATE_META_LLAMA_3_1_405B_INSTRUCT);
      expect(models.length).toBe(7);
    });
  });

  // ─── buildPrompt: unsupported model ────────────────────────────────────────

  describe('buildPrompt — unsupported model', () => {
    it('throws for an unknown model key', () => {
      expect(() =>
        builder.buildPrompt('unknown/model' as ModelKey, makeParams(), 'hi'),
      ).toThrow('Unsupported text model');
    });
  });

  // ─── DeepSeekR1 ────────────────────────────────────────────────────────────

  describe('DeepSeek R1', () => {
    const model = ModelKey.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1;

    it('uses defaults when params are empty', () => {
      const result = builder.buildPrompt(
        model,
        makeParams(),
        'test',
      ) as AnyInput;
      expect(result.prompt).toBe('test');
      expect(result.frequency_penalty).toBe(0);
      expect(result.presence_penalty).toBe(0);
      expect(result.max_tokens).toBe(2048);
      expect(result.temperature).toBe(0.1);
      expect(result.top_p).toBe(1);
    });

    it('uses provided param values', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({
          frequencyPenalty: 0.5,
          maxTokens: 4096,
          temperature: 0.7,
          topP: 0.9,
        }),
        'query',
      ) as AnyInput;
      expect(result.frequency_penalty).toBe(0.5);
      expect(result.max_tokens).toBe(4096);
      expect(result.temperature).toBe(0.7);
      expect(result.top_p).toBe(0.9);
    });
  });

  // ─── GPT-5.2 ───────────────────────────────────────────────────────────────

  describe('GPT 5.2', () => {
    const model = ModelKey.REPLICATE_OPENAI_GPT_5_2;

    it('builds basic input with prompt', () => {
      const result = builder.buildPrompt(
        model,
        makeParams(),
        'gpt prompt',
      ) as AnyInput;
      expect(result.prompt).toBe('gpt prompt');
      expect(result.max_completion_tokens).toBe(8192);
      expect(result.system_prompt).toBeUndefined();
      expect(result.image_input).toBeUndefined();
    });

    it('includes system_prompt when provided', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({ systemPrompt: 'You are helpful.' }),
        'q',
      ) as AnyInput;
      expect(result.system_prompt).toBe('You are helpful.');
    });

    it('includes image_input from references (max 10)', () => {
      const references = Array.from({ length: 15 }, (_, i) => `url-${i}`);
      const result = builder.buildPrompt(
        model,
        makeParams({ references }),
        'q',
      ) as AnyInput;
      expect(Array.isArray(result.image_input)).toBe(true);
      expect((result.image_input as string[]).length).toBe(10);
    });

    it('omits image_input when references is empty', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({ references: [] }),
        'q',
      ) as AnyInput;
      expect(result.image_input).toBeUndefined();
    });
  });

  // ─── GPT Image 1.5 ─────────────────────────────────────────────────────────

  describe('GPT Image 1.5', () => {
    const model = ModelKey.REPLICATE_OPENAI_GPT_IMAGE_1_5;

    it('builds input with prompt and default aspect ratio', () => {
      const result = builder.buildPrompt(
        model,
        makeParams(),
        'img prompt',
      ) as AnyInput;
      expect(result.prompt).toBe('img prompt');
      expect(result.aspect_ratio).toBe('16:9');
    });

    it('includes input_images from references', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({
          references: ['http://a.com/1.jpg', 'http://b.com/2.jpg'],
        }),
        'img',
      ) as AnyInput;
      expect(result.input_images).toEqual([
        'http://a.com/1.jpg',
        'http://b.com/2.jpg',
      ]);
    });

    it('includes number_of_images when outputs > 1', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({ outputs: 5 }),
        'img',
      ) as AnyInput;
      expect(result.number_of_images).toBe(5);
    });

    it('caps number_of_images at 10', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({ outputs: 99 }),
        'img',
      ) as AnyInput;
      expect(result.number_of_images).toBe(10);
    });

    it('omits number_of_images when outputs is 1', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({ outputs: 1 }),
        'img',
      ) as AnyInput;
      expect(result.number_of_images).toBeUndefined();
    });
  });

  // ─── Gemini 2.5 Flash ──────────────────────────────────────────────────────

  describe('Gemini 2.5 Flash', () => {
    const model = ModelKey.REPLICATE_GOOGLE_GEMINI_2_5_FLASH;

    it('builds with defaults', () => {
      const result = builder.buildPrompt(
        model,
        makeParams(),
        'gemini q',
      ) as AnyInput;
      expect(result.prompt).toBe('gemini q');
      expect(result.max_output_tokens).toBe(8192);
      expect(result.temperature).toBe(1);
      expect(result.top_p).toBe(0.95);
    });

    it('includes system_instruction when systemPrompt provided', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({ systemPrompt: 'Be concise.' }),
        'q',
      ) as AnyInput;
      expect(result.system_instruction).toBe('Be concise.');
    });

    it('includes images from references', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({ references: ['img1', 'img2'] }),
        'q',
      ) as AnyInput;
      expect(result.images).toEqual(['img1', 'img2']);
    });
  });

  // ─── Gemini 3 Pro ──────────────────────────────────────────────────────────

  describe('Gemini 3 Pro', () => {
    const model = ModelKey.REPLICATE_GOOGLE_GEMINI_3_PRO;

    it('uses default max_output_tokens of 65535', () => {
      const result = builder.buildPrompt(model, makeParams(), 'q') as AnyInput;
      expect(result.max_output_tokens).toBe(65535);
    });

    it('includes thinking_level when provided', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({
          thinkingLevel: 'high' as Parameters<
            typeof makeParams
          >[0]['thinkingLevel'],
        }),
        'q',
      ) as AnyInput;
      expect(result.thinking_level).toBe('high');
    });
  });

  // ─── Llama 3.1 405B ────────────────────────────────────────────────────────

  describe('Llama 3.1 405B', () => {
    const model = ModelKey.REPLICATE_META_LLAMA_3_1_405B_INSTRUCT;

    it('builds with defaults', () => {
      const result = builder.buildPrompt(
        model,
        makeParams(),
        'llama q',
      ) as AnyInput;
      expect(result.prompt).toBe('llama q');
      expect(result.max_tokens).toBe(512);
      expect(result.temperature).toBe(0.6);
      expect(result.top_k).toBe(50);
      expect(result.top_p).toBe(0.9);
    });

    it('includes system_prompt when provided', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({ systemPrompt: 'Be helpful.' }),
        'q',
      ) as AnyInput;
      expect(result.system_prompt).toBe('Be helpful.');
    });

    it('overrides defaults with provided params', () => {
      const result = builder.buildPrompt(
        model,
        makeParams({ maxTokens: 1024, temperature: 0.3, topK: 100 }),
        'q',
      ) as AnyInput;
      expect(result.max_tokens).toBe(1024);
      expect(result.temperature).toBe(0.3);
      expect(result.top_k).toBe(100);
    });
  });
});
