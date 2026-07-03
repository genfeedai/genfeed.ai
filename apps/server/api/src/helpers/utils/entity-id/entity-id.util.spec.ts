import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import type { IAuthPublicMetadata } from '@libs/interfaces/auth-public-metadata.interface';

// Mock cache decorator
vi.mock('@helpers/utils/cache/cache.util', () => ({
  CacheResult:
    () =>
    (_target: object, _propertyKey: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

describe('EntityIdUtil', () => {
  describe('validate', () => {
    it('should validate valid ObjectId string', () => {
      const validId = '507f1f77bcf86cd799439011';
      const result = EntityIdUtil.validate(validId);

      expect(result).toEqual(expect.any(String));
      expect(result.toString()).toBe(validId);
    });

    it('should throw error for empty string', () => {
      expect(() => EntityIdUtil.validate('', 'id')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for null', () => {
      expect(() => EntityIdUtil.validate('', 'id')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for invalid ObjectId format', () => {
      expect(() => EntityIdUtil.validate('invalid-id')).toThrow(
        ValidationException,
      );
    });

    it('should use custom field name in error message', () => {
      expect(() => EntityIdUtil.validate('invalid', 'userId')).toThrow(
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

      const result = EntityIdUtil.validateMany(validIds);

      expect(result).toHaveLength(3);
      result.forEach((id) => {
        expect(id).toEqual(expect.any(String));
      });
    });

    it('should throw error for non-array input', () => {
      expect(() => EntityIdUtil.validateMany(['not-array'], 'ids')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for empty array', () => {
      expect(() => EntityIdUtil.validateMany([], 'ids')).toThrow(
        ValidationException,
      );
    });

    it('should throw error with index for invalid ObjectId in array', () => {
      const mixedIds = [
        '507f1f77bcf86cd799439011',
        'invalid-id',
        '507f1f77bcf86cd799439013',
      ];

      expect(() => EntityIdUtil.validateMany(mixedIds, 'ids')).toThrow(
        ValidationException,
      );
    });
  });

  describe('isValid', () => {
    it('should return true for valid ObjectId string', () => {
      expect(EntityIdUtil.isValid('507f1f77bcf86cd799439011')).toBe(true);
    });

    it('should return false for invalid ObjectId string', () => {
      expect(EntityIdUtil.isValid('invalid-id')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(EntityIdUtil.isValid(123)).toBe(false);
      expect(EntityIdUtil.isValid('')).toBe(false);
      expect(EntityIdUtil.isValid(undefined)).toBe(false);
      expect(EntityIdUtil.isValid({})).toBe(false);
    });
  });

  describe('toValidId', () => {
    it('should return valid id string', () => {
      const result = EntityIdUtil.toValidId('507f1f77bcf86cd799439011');

      expect(result).toEqual(expect.any(String));
    });

    it('should return null for invalid string', () => {
      const result = EntityIdUtil.toValidId('invalid-id');

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = EntityIdUtil.toValidId('');

      expect(result).toBeNull();
    });

    it('should return null for non-string', () => {
      const result = EntityIdUtil.toValidId('123');

      expect(result).toBeNull();
    });
  });

  describe('enrichWithUserContext', () => {
    it('should enrich DTO with user and organization', () => {
      const dto = { name: 'Test' };
      const publicMetadata = {
        organization: '507f1f77bcf86cd799439012',
        user: '507f1f77bcf86cd799439011',
      };

      const result = EntityIdUtil.enrichWithUserContext(
        dto,
        publicMetadata as IAuthPublicMetadata,
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

      const result = EntityIdUtil.enrichWithUserContext(
        dto,
        publicMetadata as IAuthPublicMetadata,
      );

      expect(result.user).toEqual(expect.any(String));
      expect(result.organization).toBeUndefined();
    });

    it('should throw error for missing user context', () => {
      const dto = { name: 'Test' };
      const publicMetadata = {} as IAuthPublicMetadata;

      expect(() =>
        EntityIdUtil.enrichWithUserContext(dto, publicMetadata),
      ).toThrow(ValidationException);
    });
  });

  describe('convertRelationshipField', () => {
    it('should convert valid ObjectId string', async () => {
      const result = await EntityIdUtil.convertRelationshipField(
        '507f1f77bcf86cd799439011',
        'parent',
      );

      expect(result).toEqual(expect.any(String));
    });

    it('should return null for null value', async () => {
      const result = await EntityIdUtil.convertRelationshipField(
        null,
        'parent',
      );

      expect(result).toBeNull();
    });

    it('should return null for undefined value', async () => {
      const result = await EntityIdUtil.convertRelationshipField(
        undefined,
        'parent',
      );

      expect(result).toBeNull();
    });

    it('should return null for empty string', async () => {
      const result = await EntityIdUtil.convertRelationshipField('', 'parent');

      expect(result).toBeNull();
    });

    it('should return null for empty object', async () => {
      const result = await EntityIdUtil.convertRelationshipField({}, 'parent');

      expect(result).toBeNull();
    });

    it('should throw error for invalid ObjectId string', async () => {
      await expect(
        EntityIdUtil.convertRelationshipField('invalid-id', 'parent'),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw error for non-empty object', async () => {
      await expect(
        EntityIdUtil.convertRelationshipField({ id: 'test' }, 'parent'),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw error for number type', async () => {
      await expect(
        EntityIdUtil.convertRelationshipField(123, 'parent'),
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

      const result = await EntityIdUtil.processSearchParams(
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

      const result = await EntityIdUtil.processSearchParams(
        params as BaseQueryDto,
      );

      expect(Array.isArray(result.user)).toBe(true);
      (result.user as string[]).forEach((id) => {
        expect(id).toEqual(expect.any(String));
      });
    });

    it('should keep non-ObjectId fields unchanged', async () => {
      const params = {
        active: true,
        age: 25,
        name: 'Test',
      };

      const result = await EntityIdUtil.processSearchParams(
        params as BaseQueryDto,
      );

      expect(result).toEqual(params);
    });

    it('should handle invalid ObjectId strings gracefully', async () => {
      const params = {
        name: 'Test',
        user: 'invalid-id',
      };

      const result = await EntityIdUtil.processSearchParams(
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

      const result = await EntityIdUtil.createSecureQuery(
        baseQuery,
        userContext as IAuthPublicMetadata,
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

      const result = await EntityIdUtil.createSecureQuery(baseQuery);

      expect(result.isDeleted).toBe(false);
    });

    it('should not override explicit isDeleted value', async () => {
      const baseQuery = {
        isDeleted: true,
        name: 'Test',
      };

      const result = await EntityIdUtil.createSecureQuery(baseQuery);

      expect(result.isDeleted).toBe(true);
    });

    it('should work without user context', async () => {
      const baseQuery = {
        name: 'Test',
      };

      const result = await EntityIdUtil.createSecureQuery(baseQuery);

      expect(result.name).toBe('Test');
      expect(result.isDeleted).toBe(false);
    });
  });
});
