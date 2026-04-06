// Mock the helpers module
vi.mock('@genfeedai/helpers', async () => ({
  ...(await vi.importActual('@genfeedai/helpers')),
  calculateAspectRatio: vi.fn((width?: number, height?: number) => {
    if (!width || !height) {
      return null;
    }
    if (width > height) {
      return '16:9';
    }
    if (height > width) {
      return '9:16';
    }
    return '1:1';
  }),
  getDefaultAspectRatio: vi.fn(() => '16:9'),
  normalizeAspectRatioForModel: vi.fn(
    (_model: string, ratio: string) => ratio || '16:9',
  ),
}));

// Mock schema util — we control schema loading in tests
vi.mock('@api/services/prompt-builder/utils/replicate-schema.util', () => ({
  clearSchemaCache: vi.fn(),
  detectImageReferenceFields: vi.fn(() => []),
  getArrayImageLimit: vi.fn(() => undefined),
  isArrayImageField: vi.fn(() => false),
  loadModelSchema: vi.fn(() => null),
  schemaHasField: vi.fn(() => false),
}));

import type { ConfigService } from '@api/config/config.service';
import { ReplicateImageBuilder } from '@api/services/prompt-builder/builders/replicate/replicate-image.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type { ReplicateModelSchema } from '@api/services/prompt-builder/interfaces/replicate-schema.interface';
import {
  detectImageReferenceFields,
  getArrayImageLimit,
  isArrayImageField,
  loadModelSchema,
  schemaHasField,
} from '@api/services/prompt-builder/utils/replicate-schema.util';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import {
  calculateAspectRatio,
  getDefaultAspectRatio,
} from '@genfeedai/helpers';

const createParams = (
  overrides: Partial<PromptBuilderParams> = {},
): PromptBuilderParams => ({
  modelCategory: overrides.modelCategory ?? ModelCategory.IMAGE,
  prompt: overrides.prompt ?? 'Test prompt',
  ...overrides,
});

type TestPromptInput = Record<string, unknown> & {
  aspect_ratio?: string;
  go_fast?: boolean;
  image?: string;
  image_input?: string[];
  input_images?: string[];
  num_outputs?: number;
  output_format?: string;
  prompt?: string;
  resolution?: string;
  safety_filter_level?: string;
  seed?: number;
};

describe('ReplicateImageBuilder', () => {
  let builder: ReplicateImageBuilder;

  const mockConfigService = {
    get: vi.fn(() => ''),
    isDevelopment: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (calculateAspectRatio as ReturnType<typeof vi.fn>).mockImplementation(
      (width?: number, height?: number) => {
        if (!width || !height) {
          return null;
        }
        if (width > height) {
          return '16:9';
        }
        if (height > width) {
          return '9:16';
        }
        return '1:1';
      },
    );
    (getDefaultAspectRatio as ReturnType<typeof vi.fn>).mockReturnValue('16:9');
    (loadModelSchema as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (detectImageReferenceFields as ReturnType<typeof vi.fn>).mockReturnValue(
      [],
    );
    (schemaHasField as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (isArrayImageField as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (getArrayImageLimit as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    builder = new ReplicateImageBuilder(
      mockConfigService as unknown as ConfigService,
    );
  });

  const buildImagePrompt = (
    model: string,
    params: PromptBuilderParams,
    prompt: string,
  ) => builder.buildPrompt(model, params, prompt) as TestPromptInput;

  // =========================================================================
  // supportsModel
  // =========================================================================
  describe('supportsModel', () => {
    it('should return true for any model (generic fallback)', () => {
      expect(builder.supportsModel(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4)).toBe(
        true,
      );
      expect(builder.supportsModel('some-new/model' as string)).toBe(true);
    });
  });

  // =========================================================================
  // getSupportedModels
  // =========================================================================
  describe('getSupportedModels', () => {
    it('should return dedicated models list', () => {
      const models = builder.getSupportedModels();
      expect(models).toContain(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4);
      expect(models).toContain(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO,
      );
      expect(models.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // buildPrompt - Dedicated models (existing switch-case routing)
  // =========================================================================
  describe('buildPrompt - dedicated models', () => {
    it('should route Imagen 4 to dedicated builder', () => {
      const result = buildImagePrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        createParams({ height: 1024, width: 1024 }),
        'A beautiful image',
      );

      expect(result.prompt).toBe('A beautiful image');
      expect(result.safety_filter_level).toBe('block_only_high');
    });

    it('should route FLUX Schnell to dedicated builder', () => {
      const result = buildImagePrompt(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
        createParams({ height: 1024, outputs: 2, width: 1024 }),
        'Fast image',
      );

      expect(result.go_fast).toBe(true);
      expect(result.num_outputs).toBe(2);
    });
  });

  // =========================================================================
  // buildPrompt - Generic builder (no schema available)
  // =========================================================================
  describe('buildGenericImagePrompt - no schema', () => {
    it('should produce basic input with prompt, aspect_ratio, output_format', () => {
      const result = buildImagePrompt(
        'new-vendor/new-model' as string,
        createParams({ height: 1024, width: 1024 }),
        'A generic prompt',
      );

      expect(result.prompt).toBe('A generic prompt');
      expect(result.aspect_ratio).toBe('1:1');
      expect(result.output_format).toBe('jpg');
    });

    it('should include seed when provided', () => {
      const result = buildImagePrompt(
        'new-vendor/new-model' as string,
        createParams({ seed: 42 }),
        'Seeded prompt',
      );

      expect(result.seed).toBe(42);
    });

    it('should include resolution when provided', () => {
      const result = buildImagePrompt(
        'new-vendor/new-model' as string,
        createParams({ resolution: '2K' }),
        'High res prompt',
      );

      expect(result.resolution).toBe('2K');
    });

    it('should include image_input for references when no schema', () => {
      const result = buildImagePrompt(
        'new-vendor/new-model' as string,
        createParams({
          references: ['https://example.com/img.jpg'],
        }),
        'With reference',
      );

      expect(result.image_input).toEqual(['https://example.com/img.jpg']);
    });

    it('should use match_input_image aspect_ratio when references provided', () => {
      const result = buildImagePrompt(
        'new-vendor/new-model' as string,
        createParams({
          references: ['https://example.com/img.jpg'],
        }),
        'With reference',
      );

      expect(result.aspect_ratio).toBe('match_input_image');
    });

    it('should use custom output format when provided', () => {
      const result = buildImagePrompt(
        'new-vendor/new-model' as string,
        createParams({ outputFormat: 'png' }),
        'PNG output',
      );

      expect(result.output_format).toBe('png');
    });
  });

  // =========================================================================
  // buildPrompt - Schema-driven generic builder
  // =========================================================================
  describe('buildGenericImagePrompt - with schema', () => {
    const fluxLikeSchema: ReplicateModelSchema = {
      properties: {
        aspect_ratio: {
          enum: ['1:1', '16:9', '9:16'],
          type: 'string',
        },
        input_images: {
          description: 'Maximum 8 images',
          items: { format: 'uri', type: 'string' },
          type: 'array',
        },
        output_format: {
          enum: ['jpg', 'png', 'webp'],
          type: 'string',
        },
        output_quality: {
          default: 80,
          maximum: 100,
          minimum: 0,
          type: 'integer',
        },
        prompt: { type: 'string' },
        resolution: {
          enum: ['0.5 MP', '1 MP', '2 MP'],
          type: 'string',
        },
        seed: { type: 'integer' },
      },
      required: ['prompt'],
      type: 'object',
    };

    const imagenLikeSchema: ReplicateModelSchema = {
      properties: {
        aspect_ratio: {
          enum: ['1:1', '16:9', '9:16'],
          type: 'string',
        },
        output_format: {
          enum: ['jpg', 'png'],
          type: 'string',
        },
        prompt: { type: 'string' },
        safety_filter_level: {
          enum: [
            'block_low_and_above',
            'block_medium_and_above',
            'block_only_high',
          ],
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    };

    const singleImageSchema: ReplicateModelSchema = {
      properties: {
        aspect_ratio: { type: 'string' },
        image: { format: 'uri', type: 'string' },
        prompt: { type: 'string' },
        seed: { type: 'integer' },
      },
      required: ['prompt'],
      type: 'object',
    };

    it('should map references to schema-detected array field', () => {
      (loadModelSchema as ReturnType<typeof vi.fn>).mockReturnValue(
        fluxLikeSchema,
      );
      (detectImageReferenceFields as ReturnType<typeof vi.fn>).mockReturnValue([
        'input_images',
      ]);
      (isArrayImageField as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (getArrayImageLimit as ReturnType<typeof vi.fn>).mockReturnValue(8);

      const result = buildImagePrompt(
        'new-vendor/flux-like' as string,
        createParams({
          references: [
            'https://example.com/1.jpg',
            'https://example.com/2.jpg',
          ],
        }),
        'Multi-image prompt',
      );

      expect(result.input_images).toEqual([
        'https://example.com/1.jpg',
        'https://example.com/2.jpg',
      ]);
      // Should NOT also have image_input (uses schema-detected field)
      expect(result.image_input).toBeUndefined();
    });

    it('should respect array image limit from schema', () => {
      (loadModelSchema as ReturnType<typeof vi.fn>).mockReturnValue(
        fluxLikeSchema,
      );
      (detectImageReferenceFields as ReturnType<typeof vi.fn>).mockReturnValue([
        'input_images',
      ]);
      (isArrayImageField as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (getArrayImageLimit as ReturnType<typeof vi.fn>).mockReturnValue(3);

      const references = Array.from(
        { length: 5 },
        (_, i) => `https://example.com/${i}.jpg`,
      );

      const result = buildImagePrompt(
        'new-vendor/limited-model' as string,
        createParams({ references }),
        'Limited images',
      );

      expect(result.input_images).toHaveLength(3);
    });

    it('should map references to single-value field for non-array schemas', () => {
      (loadModelSchema as ReturnType<typeof vi.fn>).mockReturnValue(
        singleImageSchema,
      );
      (detectImageReferenceFields as ReturnType<typeof vi.fn>).mockReturnValue([
        'image',
      ]);
      (isArrayImageField as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = buildImagePrompt(
        'new-vendor/single-image' as string,
        createParams({
          references: [
            'https://example.com/1.jpg',
            'https://example.com/2.jpg',
          ],
        }),
        'Single image ref',
      );

      expect(result.image).toBe('https://example.com/1.jpg');
      expect(result.image_input).toBeUndefined();
      expect(result.input_images).toBeUndefined();
    });

    it('should include safety_filter_level when schema has it', () => {
      (loadModelSchema as ReturnType<typeof vi.fn>).mockReturnValue(
        imagenLikeSchema,
      );
      (schemaHasField as ReturnType<typeof vi.fn>).mockImplementation(
        (_schema: ReplicateModelSchema, field: string) =>
          field in imagenLikeSchema.properties,
      );

      const result = buildImagePrompt(
        'new-vendor/imagen-like' as string,
        createParams({ height: 1024, width: 1024 }),
        'Safe prompt',
      );

      expect(result.safety_filter_level).toBe('block_only_high');
    });

    it('should omit safety_filter_level when schema lacks it', () => {
      (loadModelSchema as ReturnType<typeof vi.fn>).mockReturnValue(
        singleImageSchema,
      );
      (schemaHasField as ReturnType<typeof vi.fn>).mockImplementation(
        (_schema: ReplicateModelSchema, field: string) =>
          field in singleImageSchema.properties,
      );

      const result = buildImagePrompt(
        'new-vendor/no-safety' as string,
        createParams({ height: 1024, width: 1024 }),
        'No safety field',
      );

      expect(result.safety_filter_level).toBeUndefined();
    });

    it('should include output_format only when schema has it', () => {
      (loadModelSchema as ReturnType<typeof vi.fn>).mockReturnValue(
        singleImageSchema,
      );
      (schemaHasField as ReturnType<typeof vi.fn>).mockImplementation(
        (_schema: ReplicateModelSchema, field: string) =>
          field in singleImageSchema.properties,
      );

      const result = buildImagePrompt(
        'new-vendor/no-output-format' as string,
        createParams(),
        'No output format',
      );

      // Schema doesn't have output_format, should not be set
      expect(result.output_format).toBeUndefined();
    });

    it('should include seed only when schema has it and param is provided', () => {
      (loadModelSchema as ReturnType<typeof vi.fn>).mockReturnValue(
        singleImageSchema,
      );
      (schemaHasField as ReturnType<typeof vi.fn>).mockImplementation(
        (_schema: ReplicateModelSchema, field: string) =>
          field in singleImageSchema.properties,
      );

      const withSeed = buildImagePrompt(
        'new-vendor/with-seed' as string,
        createParams({ seed: 99 }),
        'Seeded',
      );
      expect(withSeed.seed).toBe(99);

      const withoutSeed = buildImagePrompt(
        'new-vendor/no-seed' as string,
        createParams(),
        'No seed',
      );
      expect(withoutSeed.seed).toBeUndefined();
    });

    it('should include resolution only when schema has it', () => {
      (loadModelSchema as ReturnType<typeof vi.fn>).mockReturnValue(
        fluxLikeSchema,
      );
      (schemaHasField as ReturnType<typeof vi.fn>).mockImplementation(
        (_schema: ReplicateModelSchema, field: string) =>
          field in fluxLikeSchema.properties,
      );

      const result = buildImagePrompt(
        'new-vendor/with-resolution' as string,
        createParams({ resolution: '2 MP' }),
        'High res',
      );

      expect(result.resolution).toBe('2 MP');
    });

    it('should handle schema with no image reference fields gracefully', () => {
      (loadModelSchema as ReturnType<typeof vi.fn>).mockReturnValue(
        imagenLikeSchema,
      );
      (detectImageReferenceFields as ReturnType<typeof vi.fn>).mockReturnValue(
        [],
      );
      (schemaHasField as ReturnType<typeof vi.fn>).mockImplementation(
        (_schema: ReplicateModelSchema, field: string) =>
          field in imagenLikeSchema.properties,
      );

      const result = buildImagePrompt(
        'new-vendor/no-refs' as string,
        createParams({
          references: ['https://example.com/img.jpg'],
        }),
        'No ref fields in schema',
      );

      // References provided but schema has no image field — should be dropped
      expect(result.image_input).toBeUndefined();
      expect(result.input_images).toBeUndefined();
      expect(result.image).toBeUndefined();
    });
  });
});
