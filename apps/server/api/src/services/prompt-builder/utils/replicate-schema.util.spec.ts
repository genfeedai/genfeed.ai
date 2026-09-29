import type { ReplicateModelSchema } from '@api/services/prompt-builder/interfaces/replicate-schema.interface';
import {
  assertRequiredSchemaInput,
  detectImageReferenceFields,
  getArrayImageLimit,
  isArrayImageField,
  schemaHasField,
} from '@api/services/prompt-builder/utils/replicate-schema.util';
import { ErrorCode } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('ReplicateSchemaUtil', () => {
  // =========================================================================
  // replicateModelIdToSlug
  // =========================================================================

  // =========================================================================
  // detectImageReferenceFields
  // =========================================================================
  describe('detectImageReferenceFields', () => {
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

    it('requires Hailuo 2.3 Fast first_frame_image', () => {
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
  });
});
