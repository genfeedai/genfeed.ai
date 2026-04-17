import { ValidationException } from '@api/helpers/exceptions/validation.exception';

// Valid 24-character hex strings that mimic ObjectId format
const validId = () =>
  Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');

describe('ObjectIdUtil', () => {
  let ObjectIdUtil: {
    validate: (id: string, fieldName?: string) => string;
    validateMany: (ids: string[], fieldName?: string) => string[];
    processSearchParams: (
      params: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    toObjectId: (id: string) => string | null;
    isValid: (id: unknown) => boolean;
    toString: (id: string) => string;
    validatePaginationParams: (
      page?: number,
      limit?: number,
    ) => { page: number; limit: number };
    validateBulkIds: (ids: string[], maxCount?: number) => string[];
    convertRelationshipField: (
      value: unknown,
      fieldName: string,
    ) => Promise<string | null>;
  };

  beforeAll(() => {
    // Use fake timers before importing to prevent real intervals
    vi.useFakeTimers();

    // Import after setting up fake timers
    const module = require('@helpers/utils/objectid/objectid.util');
    ObjectIdUtil = module.ObjectIdUtil;
  });

  afterAll(() => {
    // Clear all timers to prevent open handles
    vi.clearAllTimers();
    // Restore real timers
    vi.useRealTimers();
  });

  describe('validate', () => {
    it('should return string for valid 24-char hex string', async () => {
      const id = validId();
      const result = await ObjectIdUtil.validate(id, 'test');
      expect(typeof result).toBe('string');
      expect(result).toBe(id);
    });

    it('should throw ValidationException for invalid string', async () => {
      await expect(
        ObjectIdUtil.validate('invalid', 'test'),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe('validateMany', () => {
    it('should validate array of ids', async () => {
      const ids = [validId(), validId()];
      const result = await ObjectIdUtil.validateMany(ids, 'ids');
      const resolved = await Promise.all(result);
      expect(resolved).toHaveLength(2);
      expect(typeof resolved[0]).toBe('string');
    });

    it('should throw ValidationException for non-array', async () => {
      await expect(
        ObjectIdUtil.validateMany('not-array' as unknown as string[]),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('should throw ValidationException for empty array', async () => {
      await expect(ObjectIdUtil.validateMany([])).rejects.toBeInstanceOf(
        ValidationException,
      );
    });
  });

  describe('processSearchParams', () => {
    it('should pass through known ID fields', async () => {
      const id1 = validId();
      const id2 = validId();
      const params = {
        asset: [id2, 'foo'],
        random: 'bar',
        user: id1,
      };
      const result = await ObjectIdUtil.processSearchParams(params);
      expect(typeof result.user).toBe('string');
      expect(result.random).toBe('bar');
    });
  });

  describe('toObjectId', () => {
    it('should return string for valid id', () => {
      const id = validId();
      const result = ObjectIdUtil.toObjectId(id);
      expect(typeof result).toBe('string');
    });

    it('should return null for invalid id', () => {
      expect(ObjectIdUtil.toObjectId('invalid')).toBeNull();
    });
  });

  describe('isValid', () => {
    it('should validate id strings correctly', () => {
      const id = validId();
      expect(ObjectIdUtil.isValid(id)).toBe(true);
      expect(ObjectIdUtil.isValid('invalid')).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the string as-is', () => {
      const id = validId();
      expect(ObjectIdUtil.toString(id)).toBe(id);
    });
  });

  describe('validatePaginationParams', () => {
    it('should clamp and default values', () => {
      const result = ObjectIdUtil.validatePaginationParams(0, 200);
      expect(result).toEqual({ limit: 100, page: 1 });
    });

    it('should throw when page number too large', () => {
      expect(() => ObjectIdUtil.validatePaginationParams(10001)).toThrow(
        ValidationException,
      );
    });
  });

  describe('validateBulkIds', () => {
    it('should validate bulk ids', async () => {
      const ids = [validId(), validId()];
      const result = await ObjectIdUtil.validateBulkIds(ids, 5);
      const resolved = await Promise.all(result);
      expect(resolved).toHaveLength(2);
    });

    it('should throw if ids exceed maxCount', () => {
      const ids = [validId(), validId(), validId()];
      expect(() => ObjectIdUtil.validateBulkIds(ids, 2)).toThrow(
        ValidationException,
      );
    });

    it('should throw if ids is not array', () => {
      expect(() =>
        ObjectIdUtil.validateBulkIds('not-array' as unknown as string[]),
      ).toThrow(ValidationException);
    });
  });

  describe('convertRelationshipField', () => {
    it('should return string for valid id', async () => {
      const id = validId();
      const result = await ObjectIdUtil.convertRelationshipField(id, 'parent');
      expect(typeof result).toBe('string');
    });

    it('should return null for null, empty string, or empty object', async () => {
      expect(
        await ObjectIdUtil.convertRelationshipField(null, 'parent'),
      ).toBeNull();
      expect(
        await ObjectIdUtil.convertRelationshipField('', 'parent'),
      ).toBeNull();
      expect(
        await ObjectIdUtil.convertRelationshipField({}, 'parent'),
      ).toBeNull();
    });

    it('should throw for invalid object', async () => {
      await expect(
        ObjectIdUtil.convertRelationshipField({ foo: 'bar' }, 'parent'),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('should throw for invalid type', async () => {
      await expect(
        ObjectIdUtil.convertRelationshipField(123, 'parent'),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });
});
