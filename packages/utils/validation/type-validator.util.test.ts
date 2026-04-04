import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  CommonSchemas,
  createValidator,
  TypeValidator,
  type ValidationSchema,
} from '@utils/validation/type-validator.util';

describe('type-validator.util', () => {
  describe('TypeValidator static type checks', () => {
    describe('isObject', () => {
      it('should return true for plain objects', () => {
        expect(TypeValidator.isObject({})).toBe(true);
        expect(TypeValidator.isObject({ a: 1 })).toBe(true);
      });

      it('should return false for null', () => {
        expect(TypeValidator.isObject(null)).toBe(false);
      });

      it('should return false for arrays', () => {
        expect(TypeValidator.isObject([])).toBe(false);
      });

      it('should return false for primitives', () => {
        expect(TypeValidator.isObject('string')).toBe(false);
        expect(TypeValidator.isObject(42)).toBe(false);
        expect(TypeValidator.isObject(true)).toBe(false);
      });
    });

    describe('isString', () => {
      it('should return true for strings', () => {
        expect(TypeValidator.isString('')).toBe(true);
        expect(TypeValidator.isString('hello')).toBe(true);
      });

      it('should return false for non-strings', () => {
        expect(TypeValidator.isString(42)).toBe(false);
        expect(TypeValidator.isString(null)).toBe(false);
        expect(TypeValidator.isString(undefined)).toBe(false);
      });
    });

    describe('isNumber', () => {
      it('should return true for valid numbers', () => {
        expect(TypeValidator.isNumber(0)).toBe(true);
        expect(TypeValidator.isNumber(42)).toBe(true);
        expect(TypeValidator.isNumber(-1.5)).toBe(true);
      });

      it('should return false for NaN', () => {
        expect(TypeValidator.isNumber(NaN)).toBe(false);
      });

      it('should return false for non-numbers', () => {
        expect(TypeValidator.isNumber('42')).toBe(false);
        expect(TypeValidator.isNumber(null)).toBe(false);
      });
    });

    describe('isBoolean', () => {
      it('should return true for booleans', () => {
        expect(TypeValidator.isBoolean(true)).toBe(true);
        expect(TypeValidator.isBoolean(false)).toBe(true);
      });

      it('should return false for non-booleans', () => {
        expect(TypeValidator.isBoolean(1)).toBe(false);
        expect(TypeValidator.isBoolean('true')).toBe(false);
      });
    });

    describe('isArray', () => {
      it('should return true for arrays', () => {
        expect(TypeValidator.isArray([])).toBe(true);
        expect(TypeValidator.isArray([1, 2, 3])).toBe(true);
      });

      it('should return false for non-arrays', () => {
        expect(TypeValidator.isArray({})).toBe(false);
        expect(TypeValidator.isArray('array')).toBe(false);
      });
    });
  });

  describe('TypeValidator.validate', () => {
    it('should validate string type', () => {
      const schema: ValidationSchema = { required: true, type: 'string' };
      expect(TypeValidator.validate<string>('hello', schema)).toBe(true);
      expect(TypeValidator.validate<string>(42, schema)).toBe(false);
    });

    it('should validate number type', () => {
      const schema: ValidationSchema = { required: true, type: 'number' };
      expect(TypeValidator.validate<number>(42, schema)).toBe(true);
      expect(TypeValidator.validate<number>('42', schema)).toBe(false);
    });

    it('should validate boolean type', () => {
      const schema: ValidationSchema = { required: true, type: 'boolean' };
      expect(TypeValidator.validate<boolean>(true, schema)).toBe(true);
      expect(TypeValidator.validate<boolean>(1, schema)).toBe(false);
    });

    it('should validate array type', () => {
      const schema: ValidationSchema = { required: true, type: 'array' };
      expect(TypeValidator.validate<unknown[]>([1, 2], schema)).toBe(true);
      expect(TypeValidator.validate<unknown[]>('not array', schema)).toBe(
        false,
      );
    });

    it('should validate array with item schema', () => {
      const schema: ValidationSchema = {
        items: { required: true, type: 'string' },
        required: true,
        type: 'array',
      };
      expect(TypeValidator.validate<string[]>(['a', 'b'], schema)).toBe(true);
      expect(TypeValidator.validate<unknown[]>(['a', 1], schema)).toBe(false);
    });

    it('should validate object type', () => {
      const schema: ValidationSchema = { required: true, type: 'object' };
      expect(TypeValidator.validate<object>({ a: 1 }, schema)).toBe(true);
      expect(TypeValidator.validate<object>('string', schema)).toBe(false);
    });

    it('should validate object with properties', () => {
      const schema: ValidationSchema = {
        properties: {
          age: { required: true, type: 'number' },
          name: { required: true, type: 'string' },
        },
        required: true,
        type: 'object',
      };
      expect(
        TypeValidator.validate<{ name: string; age: number }>(
          { age: 30, name: 'John' },
          schema,
        ),
      ).toBe(true);
      expect(
        TypeValidator.validate<unknown>(
          { age: 'thirty', name: 'John' },
          schema,
        ),
      ).toBe(false);
    });

    it('should handle optional fields', () => {
      const schema: ValidationSchema = {
        properties: {
          name: { required: true, type: 'string' },
          nickname: { required: false, type: 'string' },
        },
        required: true,
        type: 'object',
      };
      expect(TypeValidator.validate<unknown>({ name: 'John' }, schema)).toBe(
        true,
      );
    });

    it('should fail on required missing field', () => {
      const schema: ValidationSchema = { required: true, type: 'string' };
      expect(TypeValidator.validate<string>(null, schema)).toBe(false);
      expect(TypeValidator.validate<string>(undefined, schema)).toBe(false);
    });

    it('should pass on optional missing field', () => {
      const schema: ValidationSchema = { required: false, type: 'string' };
      expect(TypeValidator.validate<string | null>(null, schema)).toBe(true);
      expect(
        TypeValidator.validate<string | undefined>(undefined, schema),
      ).toBe(true);
    });

    it('should validate union types', () => {
      const schema: ValidationSchema = {
        oneOf: [
          { required: true, type: 'string' },
          { required: true, type: 'number' },
        ],
        required: true,
        type: 'union',
      };
      expect(TypeValidator.validate<string | number>('hello', schema)).toBe(
        true,
      );
      expect(TypeValidator.validate<string | number>(42, schema)).toBe(true);
      expect(TypeValidator.validate<unknown>(true, schema)).toBe(false);
    });

    it('should support custom validators', () => {
      const schema: ValidationSchema = {
        required: true,
        type: 'number',
        validator: (v: unknown) => typeof v === 'number' && v >= 0 && v <= 100,
      };
      expect(TypeValidator.validate<number>(50, schema)).toBe(true);
      expect(TypeValidator.validate<number>(150, schema)).toBe(false);
    });
  });

  describe('TypeValidator.assertType', () => {
    it('should not throw for valid data', () => {
      const schema: ValidationSchema = { required: true, type: 'string' };
      expect(() =>
        TypeValidator.assertType<string>('hello', schema),
      ).not.toThrow();
    });

    it('should throw TypeError for invalid data', () => {
      const schema: ValidationSchema = { required: true, type: 'string' };
      expect(() => TypeValidator.assertType<string>(42, schema)).toThrow(
        TypeError,
      );
    });

    it('should include path in error message', () => {
      const schema: ValidationSchema = { required: true, type: 'string' };
      expect(() =>
        TypeValidator.assertType<string>(42, schema, 'myField'),
      ).toThrow(/myField/);
    });
  });

  describe('CommonSchemas', () => {
    it('should have valid id schema', () => {
      expect(CommonSchemas.id.type).toBe('string');
      expect(CommonSchemas.id.required).toBe(true);
    });

    it('should validate baseEntity shape', () => {
      const entity = {
        createdAt: '2024-01-01T00:00:00Z',
        id: 'test-123',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      expect(
        TypeValidator.validate<unknown>(entity, CommonSchemas.baseEntity),
      ).toBe(true);
    });

    it('should fail baseEntity without required fields', () => {
      expect(
        TypeValidator.validate<unknown>(
          { id: 'test' },
          CommonSchemas.baseEntity,
        ),
      ).toBe(false);
    });

    it('should validate timestamp with custom validator', () => {
      expect(
        TypeValidator.validate<string>(
          '2024-01-01T00:00:00Z',
          CommonSchemas.timestamp,
        ),
      ).toBe(true);
      expect(
        TypeValidator.validate<string>('not-a-date', CommonSchemas.timestamp),
      ).toBe(false);
    });

    it('should validate paginatedResponse shape', () => {
      const response = {
        docs: [{ id: '1' }],
        limit: 10,
        page: 1,
        pages: 5,
        total: 50,
      };
      expect(
        TypeValidator.validate<unknown>(
          response,
          CommonSchemas.paginatedResponse,
        ),
      ).toBe(true);
    });

    it('should validate userMinimal shape', () => {
      const user = { id: 'user-123' };
      expect(
        TypeValidator.validate<unknown>(user, CommonSchemas.userMinimal),
      ).toBe(true);
    });

    it('should validate accountMinimal shape', () => {
      const account = { id: 'acc-123' };
      expect(
        TypeValidator.validate<unknown>(account, CommonSchemas.accountMinimal),
      ).toBe(true);
    });

    it('should validate metadataFull shape', () => {
      const metadata = { id: 'meta-123' };
      expect(
        TypeValidator.validate<unknown>(metadata, CommonSchemas.metadataFull),
      ).toBe(true);
    });
  });

  describe('createValidator', () => {
    it('should return validate and assert functions', () => {
      const schema: ValidationSchema = { required: true, type: 'string' };
      const validator = createValidator<string>(schema);
      expect(typeof validator.validate).toBe('function');
      expect(typeof validator.assert).toBe('function');
    });

    it('validate should return true for valid input', () => {
      const validator = createValidator<string>({
        required: true,
        type: 'string',
      });
      expect(validator.validate('hello')).toBe(true);
    });

    it('validate should return false for invalid input', () => {
      const validator = createValidator<string>({
        required: true,
        type: 'string',
      });
      expect(validator.validate(42)).toBe(false);
    });

    it('assert should not throw for valid input', () => {
      const validator = createValidator<string>({
        required: true,
        type: 'string',
      });
      expect(() => validator.assert('hello')).not.toThrow();
    });

    it('assert should throw TypeError for invalid input', () => {
      const validator = createValidator<string>({
        required: true,
        type: 'string',
      });
      expect(() => validator.assert(42)).toThrow(TypeError);
    });
  });
});
