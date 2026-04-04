import { ValidationException } from '@api/helpers/exceptions/validation.exception';
import { Types } from 'mongoose';

describe('ObjectIdUtil', () => {
  let ObjectIdUtil: any;

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
    it('should return ObjectId for valid string', async () => {
      const id = new Types.ObjectId().toString();
      const result = await ObjectIdUtil.validate(id, 'test');
      expect(result).toBeInstanceOf(Types.ObjectId);
      expect(result.toString()).toBe(id);
    });

    it('should throw ValidationException for invalid string', async () => {
      await expect(
        ObjectIdUtil.validate('invalid', 'test'),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe('validateMany', () => {
    it('should validate array of ids', async () => {
      const ids = [
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
      ];
      const result = await ObjectIdUtil.validateMany(ids, 'ids');
      const resolved = await Promise.all(result);
      expect(resolved).toHaveLength(2);
      expect(resolved[0]).toBeInstanceOf(Types.ObjectId);
    });

    it('should throw ValidationException for non-array', async () => {
      await expect(
        ObjectIdUtil.validateMany('not-array'),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('should throw ValidationException for empty array', async () => {
      await expect(ObjectIdUtil.validateMany([])).rejects.toBeInstanceOf(
        ValidationException,
      );
    });
  });

  describe('processSearchParams', () => {
    it('should convert known ObjectId fields', async () => {
      const id1 = new Types.ObjectId().toString();
      const id2 = new Types.ObjectId().toString();
      const params = {
        asset: [id2, 'foo'],
        random: 'bar',
        user: id1,
      };
      const result = await ObjectIdUtil.processSearchParams(params);
      const user = await result.user;
      expect(user).toBeInstanceOf(Types.ObjectId);
      expect(result.asset[0]).toBeInstanceOf(Types.ObjectId);
      expect(result.asset[1]).toBe('foo');
      expect(result.random).toBe('bar');
    });
  });

  describe('toObjectId', () => {
    it('should return ObjectId for valid id', () => {
      const id = new Types.ObjectId().toString();
      const result = ObjectIdUtil.toObjectId(id);
      expect(result).toBeInstanceOf(Types.ObjectId);
    });

    it('should return null for invalid id', () => {
      expect(ObjectIdUtil.toObjectId('invalid')).toBeNull();
    });
  });

  describe('isValid', () => {
    it('should validate id strings correctly', () => {
      const id = new Types.ObjectId().toString();
      expect(ObjectIdUtil.isValid(id)).toBe(true);
      expect(ObjectIdUtil.isValid('invalid')).toBe(false);
    });
  });

  describe('toString', () => {
    it('should convert ObjectId to string', () => {
      const id = new Types.ObjectId();
      expect(ObjectIdUtil.toString(id)).toBe(id.toString());
      expect(ObjectIdUtil.toString(id.toString())).toBe(id.toString());
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
      const ids = [
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
      ];
      const result = await ObjectIdUtil.validateBulkIds(ids, 5);
      const resolved = await Promise.all(result);
      expect(resolved).toHaveLength(2);
    });

    it('should throw if ids exceed maxCount', () => {
      const ids = [
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
      ];
      expect(() => ObjectIdUtil.validateBulkIds(ids, 2)).toThrow(
        ValidationException,
      );
    });

    it('should throw if ids is not array', () => {
      expect(() => ObjectIdUtil.validateBulkIds('not-array')).toThrow(
        ValidationException,
      );
    });
  });

  describe('convertRelationshipField', () => {
    it('should return ObjectId for valid string', async () => {
      const id = new Types.ObjectId().toString();
      const result = await ObjectIdUtil.convertRelationshipField(id, 'parent');
      expect(result).toBeInstanceOf(Types.ObjectId);
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
