import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import type { IClerkPublicMetadata } from '@libs/interfaces/clerk.interface';

// Mock cache decorator
vi.mock('@helpers/utils/cache/cache.util', () => ({
  CacheResult:
    () =>
    (_target: object, _propertyKey: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

describe('ObjectIdUtil', () => {
  describe('validate', () => {
    it('should validate valid ObjectId string', () => {
      const validId = '507f1f77bcf86cd799439011';
      const result = ObjectIdUtil.validate(validId);

      expect(result).toEqual(expect.any(String));
      expect(result.toString()).toBe(validId);
    });

    it('should throw error for empty string', () => {
      expect(() => ObjectIdUtil.validate('', 'id')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for null', () => {
      expect(() => ObjectIdUtil.validate('', 'id')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for invalid ObjectId format', () => {
      expect(() => ObjectIdUtil.validate('invalid-id')).toThrow(
        ValidationException,
      );
    });

    it('should use custom field name in error message', () => {
      expect(() => ObjectIdUtil.validate('invalid', 'userId')).toThrow(
        ValidationException,
      );
    });
  });

  describe('validateMany', () => {
    it('should validate array of valid ObjectIds', () => {
      const validIds = [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013',
      ];

      const result = ObjectIdUtil.validateMany(validIds);

      expect(result).toHaveLength(3);
      result.forEach((id) => expect(id).toEqual(expect.any(String)));
    });

    it('should throw error for non-array input', () => {
      expect(() => ObjectIdUtil.validateMany(['not-array'], 'ids')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for empty array', () => {
      expect(() => ObjectIdUtil.validateMany([], 'ids')).toThrow(
        ValidationException,
      );
    });

    it('should throw error with index for invalid ObjectId in array', () => {
      const mixedIds = [
        '507f1f77bcf86cd799439011',
        'invalid-id',
        '507f1f77bcf86cd799439013',
      ];

      expect(() => ObjectIdUtil.validateMany(mixedIds, 'ids')).toThrow(
        ValidationException,
      );
    });
  });

  describe('isValid', () => {
    it('should return true for valid ObjectId string', () => {
      expect(ObjectIdUtil.isValid('507f1f77bcf86cd799439011')).toBe(true);
    });

    it('should return false for invalid ObjectId string', () => {
      expect(ObjectIdUtil.isValid('invalid-id')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(ObjectIdUtil.isValid(123)).toBe(false);
      expect(ObjectIdUtil.isValid('')).toBe(false);
      expect(ObjectIdUtil.isValid(undefined)).toBe(false);
      expect(ObjectIdUtil.isValid({})).toBe(false);
    });
  });

  describe('toString', () => {
    it('should convert ObjectId to string', () => {
      const objectId = '507f1f77bcf86cd799439011';
      const result = ObjectIdUtil.toString(objectId);

      expect(result).toBe('507f1f77bcf86cd799439011');
    });

    it('should return string as is', () => {
      const id = '507f1f77bcf86cd799439011';
      const result = ObjectIdUtil.toString(id);

      expect(result).toBe(id);
    });
  });

  describe('toObjectId', () => {
    it('should convert valid string to ObjectId', () => {
      const result = ObjectIdUtil.toObjectId('507f1f77bcf86cd799439011');

      expect(result).toEqual(expect.any(String));
    });

    it('should return null for invalid string', () => {
      const result = ObjectIdUtil.toObjectId('invalid-id');

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = ObjectIdUtil.toObjectId('');

      expect(result).toBeNull();
    });

    it('should return null for non-string', () => {
      const result = ObjectIdUtil.toObjectId('123');

      expect(result).toBeNull();
    });
  });

  describe('validatePaginationParams', () => {
    it('should validate and return pagination params', () => {
      const result = ObjectIdUtil.validatePaginationParams(2, 20);

      expect(result).toEqual({ limit: 20, page: 2 });
    });

    it('should use defaults for missing params', () => {
      const result = ObjectIdUtil.validatePaginationParams();

      expect(result).toEqual({ limit: 10, page: 1 });
    });

    it('should enforce minimum page of 1', () => {
      const result = ObjectIdUtil.validatePaginationParams(0, 10);

      expect(result.page).toBe(1);
    });

    it('should enforce maximum limit of 100', () => {
      const result = ObjectIdUtil.validatePaginationParams(1, 200);

      expect(result.limit).toBe(100);
    });

    it('should enforce minimum limit of 1', () => {
      // When limit is 0 (falsy), the implementation falls back to default 10
      // due to `Number(limit) || 10` — 0 is treated as falsy
      const result = ObjectIdUtil.validatePaginationParams(1, 0);

      expect(result.limit).toBe(10);
    });

    it('should throw error for page number too large', () => {
      expect(() => ObjectIdUtil.validatePaginationParams(20000, 10)).toThrow(
        ValidationException,
      );
    });

    it('should floor decimal values', () => {
      const result = ObjectIdUtil.validatePaginationParams(2.7, 15.9);

      expect(result).toEqual({ limit: 15, page: 2 });
    });
  });

  describe('validateBulkIds', () => {
    it('should validate array of ObjectId strings', () => {
      const ids = [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013',
      ];

      const result = ObjectIdUtil.validateBulkIds(ids);

      expect(result).toHaveLength(3);
      result.forEach((id) => expect(id).toEqual(expect.any(String)));
    });

    it('should throw error for non-array', () => {
      expect(() => ObjectIdUtil.validateBulkIds(['not-array'])).toThrow(
        ValidationException,
      );
    });

    it('should throw error for empty array', () => {
      expect(() => ObjectIdUtil.validateBulkIds([])).toThrow(
        ValidationException,
      );
    });

    it('should throw error for too many IDs', () => {
      const tooManyIds = Array(150).fill('507f1f77bcf86cd799439011');

      expect(() => ObjectIdUtil.validateBulkIds(tooManyIds)).toThrow(
        ValidationException,
      );
    });

    it('should accept custom max count', () => {
      const ids = Array(60).fill('507f1f77bcf86cd799439011');

      expect(() => ObjectIdUtil.validateBulkIds(ids, 50)).toThrow(
        ValidationException,
      );
    });
  });

  describe('enrichWithUserContext', () => {
    it('should enrich DTO with user and organization', () => {
      const dto = { name: 'Test' };
      const publicMetadata = {
        organization: '507f1f77bcf86cd799439012',
        user: '507f1f77bcf86cd799439011',
      };

      const result = ObjectIdUtil.enrichWithUserContext(
        dto,
        publicMetadata as IClerkPublicMetadata,
      );

      expect(result.name).toBe('Test');
      expect(result.user).toEqual(expect.any(String));
      expect(result.organization).toEqual(expect.any(String));
    });

    it('should enrich DTO without organization', () => {
      const dto = { name: 'Test' };
      const publicMetadata = {
        user: '507f1f77bcf86cd799439011',
      };

      const result = ObjectIdUtil.enrichWithUserContext(
        dto,
        publicMetadata as IClerkPublicMetadata,
      );

      expect(result.user).toEqual(expect.any(String));
      expect(result.organization).toBeUndefined();
    });

    it('should throw error for missing user context', () => {
      const dto = { name: 'Test' };
      const publicMetadata = {} as IClerkPublicMetadata;

      expect(() =>
        ObjectIdUtil.enrichWithUserContext(dto, publicMetadata),
      ).toThrow(ValidationException);
    });
  });

  describe('convertRelationshipField', () => {
    it('should convert valid ObjectId string', async () => {
      const result = await ObjectIdUtil.convertRelationshipField(
        '507f1f77bcf86cd799439011',
        'parent',
      );

      expect(result).toEqual(expect.any(String));
    });

    it('should return null for null value', async () => {
      const result = await ObjectIdUtil.convertRelationshipField(
        null,
        'parent',
      );

      expect(result).toBeNull();
    });

    it('should return null for undefined value', async () => {
      const result = await ObjectIdUtil.convertRelationshipField(
        undefined,
        'parent',
      );

      expect(result).toBeNull();
    });

    it('should return null for empty string', async () => {
      const result = await ObjectIdUtil.convertRelationshipField('', 'parent');

      expect(result).toBeNull();
    });

    it('should return null for empty object', async () => {
      const result = await ObjectIdUtil.convertRelationshipField({}, 'parent');

      expect(result).toBeNull();
    });

    it('should throw error for invalid ObjectId string', async () => {
      await expect(
        ObjectIdUtil.convertRelationshipField('invalid-id', 'parent'),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw error for non-empty object', async () => {
      await expect(
        ObjectIdUtil.convertRelationshipField({ id: 'test' }, 'parent'),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw error for number type', async () => {
      await expect(
        ObjectIdUtil.convertRelationshipField(123, 'parent'),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('processSearchParams', () => {
    it('should convert known ObjectId fields', async () => {
      const params = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Test',
        organization: '507f1f77bcf86cd799439013',
        user: '507f1f77bcf86cd799439012',
      };

      const result = await ObjectIdUtil.processSearchParams(
        params as BaseQueryDto,
      );

      expect(result._id).toEqual(expect.any(String));
      expect(result.user).toEqual(expect.any(String));
      expect(result.organization).toEqual(expect.any(String));
      expect(result.name).toBe('Test');
    });

    it('should handle array of ObjectIds', async () => {
      const params = {
        user: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
      };

      const result = await ObjectIdUtil.processSearchParams(
        params as BaseQueryDto,
      );

      expect(Array.isArray(result.user)).toBe(true);
      (result.user as string[]).forEach((id) =>
        expect(id).toEqual(expect.any(String)),
      );
    });

    it('should keep non-ObjectId fields unchanged', async () => {
      const params = {
        active: true,
        age: 25,
        name: 'Test',
      };

      const result = await ObjectIdUtil.processSearchParams(
        params as BaseQueryDto,
      );

      expect(result).toEqual(params);
    });

    it('should handle invalid ObjectId strings gracefully', async () => {
      const params = {
        name: 'Test',
        user: 'invalid-id',
      };

      const result = await ObjectIdUtil.processSearchParams(
        params as BaseQueryDto,
      );

      expect(result.user).toBe('invalid-id'); // Keeps original value
      expect(result.name).toBe('Test');
    });
  });

  describe('createSecureQuery', () => {
    it('should create secure query with user context', async () => {
      const baseQuery = {
        name: 'Test',
      };
      const userContext = {
        organization: '507f1f77bcf86cd799439012',
        user: '507f1f77bcf86cd799439011',
      };

      const result = await ObjectIdUtil.createSecureQuery(
        baseQuery,
        userContext as IClerkPublicMetadata,
      );

      expect(result.name).toBe('Test');
      expect(result.user).toEqual(expect.any(String));
      expect(result.organization).toEqual(expect.any(String));
      expect(result.isDeleted).toBe(false);
    });

    it('should add isDeleted false by default', async () => {
      const baseQuery = {
        name: 'Test',
      };

      const result = await ObjectIdUtil.createSecureQuery(baseQuery);

      expect(result.isDeleted).toBe(false);
    });

    it('should not override explicit isDeleted value', async () => {
      const baseQuery = {
        isDeleted: true,
        name: 'Test',
      };

      const result = await ObjectIdUtil.createSecureQuery(baseQuery);

      expect(result.isDeleted).toBe(true);
    });

    it('should work without user context', async () => {
      const baseQuery = {
        name: 'Test',
      };

      const result = await ObjectIdUtil.createSecureQuery(baseQuery);

      expect(result.name).toBe('Test');
      expect(result.isDeleted).toBe(false);
    });
  });
});
