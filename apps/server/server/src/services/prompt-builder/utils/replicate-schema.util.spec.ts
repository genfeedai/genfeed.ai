import { MODEL_KEYS } from '@genfeedai/constants';
import { ErrorCode } from '@genfeedai/enums';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ReplicateModelSchema } from '@server/services/prompt-builder/interfaces/replicate-schema.interface';
import {
  assertRequiredSchemaInput,
  clearSchemaCache,
  detectImageReferenceFields,
  getArrayImageLimit,
  isArrayImageField,
  loadModelSchema,
  modelIdToSchemaFilename,
  resolveModelSchema,
  schemaHasField,
} from '@server/services/prompt-builder/utils/replicate-schema.util';

describe('ReplicateSchemaUtil', () => {
  afterEach(() => {
    clearSchemaCache();
  });

  // =========================================================================
  // modelIdToSchemaFilename
  // =========================================================================
  describe('modelIdToSchemaFilename', () => {
    it('should extract model name from owner/model format', () => {
      expect(modelIdToSchemaFilename('google/imagen-4')).toBe(
        'imagen-4.schema.json',
      );
    });

    it('should handle model IDs with version hashes', () => {
      expect(modelIdToSchemaFilename('genfeedai/custom-model:abc123')).toBe(
        'custom-model.schema.json',
      );
    });

    it('should handle model IDs without owner prefix', () => {
      expect(modelIdToSchemaFilename('some-model')).toBe(
        'some-model.schema.json',
      );
    });

    it('should use last segment for multi-segment paths', () => {
      expect(modelIdToSchemaFilename('black-forest-labs/flux-2-pro')).toBe(
        'flux-2-pro.schema.json',
      );
    });
  });

  // =========================================================================
  // loadModelSchema
  // =========================================================================
  describe('loadModelSchema', () => {
    it('should load an existing schema file', () => {
      const schema = loadModelSchema('google/imagen-4');
      expect(schema).not.toBeNull();
      expect(schema?.properties.prompt).toBeDefined();
      expect(schema?.properties.aspect_ratio).toBeDefined();
    });

    it('should return null for non-existent schema', () => {
      const schema = loadModelSchema('nonexistent/model');
      expect(schema).toBeNull();
    });

    it('should cache results on repeated calls', () => {
      const first = loadModelSchema('google/imagen-4');
      const second = loadModelSchema('google/imagen-4');
      expect(first).toBe(second); // Same reference = cached
    });

    it('should cache null for missing schemas', () => {
      loadModelSchema('missing/model');
      // Second call should not throw, returns cached null
      const result = loadModelSchema('missing/model');
      expect(result).toBeNull();
    });
  });

  describe('resolveModelSchema', () => {
    it('prefers the reviewed provider contract projection', () => {
      const reviewed = {
        properties: { current_field: { type: 'string' } },
        required: ['current_field'],
        type: 'object',
      };

      expect(resolveModelSchema('google/imagen-4', reviewed)).toBe(reviewed);
    });

    it('falls back to the checked-in legacy schema before migration review', () => {
      expect(resolveModelSchema('google/imagen-4')).toEqual(
        loadModelSchema('google/imagen-4'),
      );
    });
  });

  // =========================================================================
  // detectImageReferenceFields
  // =========================================================================
  describe('detectImageReferenceFields', () => {
    it('should detect image_input field', () => {
      const schema: ReplicateModelSchema = {
        properties: {
          image_input: {
            items: { format: 'uri', type: 'string' },
            type: 'array',
          },
          prompt: { type: 'string' },
        },
        type: 'object',
      };

      const fields = detectImageReferenceFields(schema);
      expect(fields).toContain('image_input');
    });

    it('should detect multiple reference field types', () => {
      const schema: ReplicateModelSchema = {
        properties: {
          image: { format: 'uri', type: 'string' },
          input_images: {
            items: { format: 'uri', type: 'string' },
            type: 'array',
          },
          prompt: { type: 'string' },
        },
        type: 'object',
      };

      const fields = detectImageReferenceFields(schema);
      expect(fields).toContain('input_images');
      expect(fields).toContain('image');
    });

    it('should return empty array when no reference fields exist', () => {
      const schema: ReplicateModelSchema = {
        properties: {
          prompt: { type: 'string' },
        },
        type: 'object',
      };

      const fields = detectImageReferenceFields(schema);
      expect(fields).toHaveLength(0);
    });
  });

  // =========================================================================
  // isArrayImageField
  // =========================================================================
  describe('isArrayImageField', () => {
    it('should return true for array URI fields', () => {
      const schema: ReplicateModelSchema = {
        properties: {
          input_images: {
            items: { format: 'uri', type: 'string' },
            type: 'array',
          },
        },
        type: 'object',
      };

      expect(isArrayImageField(schema, 'input_images')).toBe(true);
    });

    it('should return false for single-value fields', () => {
      const schema: ReplicateModelSchema = {
        properties: {
          image: { format: 'uri', type: 'string' },
        },
        type: 'object',
      };

      expect(isArrayImageField(schema, 'image')).toBe(false);
    });
  });

  // =========================================================================
  // getArrayImageLimit
  // =========================================================================
  describe('getArrayImageLimit', () => {
    it('should parse "Maximum N images" pattern', () => {
      const schema: ReplicateModelSchema = {
        properties: {
          input_images: {
            description: 'Maximum 8 images',
            items: { format: 'uri', type: 'string' },
            type: 'array',
          },
        },
        type: 'object',
      };

      expect(getArrayImageLimit(schema, 'input_images')).toBe(8);
    });

    it('should parse "up to N images" pattern', () => {
      const schema: ReplicateModelSchema = {
        properties: {
          image_input: {
            description:
              'Input images to transform or use as reference (supports up to 14 images)',
            items: { format: 'uri', type: 'string' },
            type: 'array',
          },
        },
        type: 'object',
      };

      expect(getArrayImageLimit(schema, 'image_input')).toBe(14);
    });

    it('should return undefined when no limit specified', () => {
      const schema: ReplicateModelSchema = {
        properties: {
          input_images: {
            description: 'List of input images',
            items: { format: 'uri', type: 'string' },
            type: 'array',
          },
        },
        type: 'object',
      };

      expect(getArrayImageLimit(schema, 'input_images')).toBeUndefined();
    });
  });

  // =========================================================================
  // schemaHasField
  // =========================================================================
  describe('schemaHasField', () => {
    const schema: ReplicateModelSchema = {
      properties: {
        aspect_ratio: { type: 'string' },
        output_format: { type: 'string' },
        prompt: { type: 'string' },
        seed: { type: 'integer' },
      },
      type: 'object',
    };

    it('should return true for existing fields', () => {
      expect(schemaHasField(schema, 'prompt')).toBe(true);
      expect(schemaHasField(schema, 'seed')).toBe(true);
      expect(schemaHasField(schema, 'output_format')).toBe(true);
    });

    it('should return false for non-existing fields', () => {
      expect(schemaHasField(schema, 'nonexistent')).toBe(false);
    });
  });

  describe('assertRequiredSchemaInput', () => {
    it('validates required fields from the reviewed projection', () => {
      try {
        assertRequiredSchemaInput(
          'unknown/dynamic-model',
          {},
          {
            properties: { prompt: { type: 'string' } },
            required: ['prompt'],
            type: 'object',
          },
        );
        throw new Error('expected validation failure');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getResponse()).toEqual(
          expect.objectContaining({ detail: 'prompt is required' }),
        );
      }
    });

    it('loads the Hailuo 2.3 Fast schema and requires first_frame_image', () => {
      const schema = loadModelSchema(
        MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
      );
      expect(schema?.required).toEqual(
        expect.arrayContaining(['prompt', 'first_frame_image']),
      );

      try {
        assertRequiredSchemaInput(
          MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
          { prompt: 'A cinematic product reveal' },
        );
        throw new Error('expected validation failure');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(httpError.getResponse()).toEqual(
          expect.objectContaining({
            code: ErrorCode.VALIDATION_FAILED,
            detail: expect.stringContaining('first_frame_image'),
          }),
        );
      }
    });

    it('accepts Hailuo 2.3 Fast input with a valid first-frame URI', () => {
      expect(() =>
        assertRequiredSchemaInput(
          MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
          {
            first_frame_image: 'https://cdn.example.com/first-frame.jpg',
            prompt: 'A cinematic product reveal',
          },
        ),
      ).not.toThrow();
    });
  });
});
