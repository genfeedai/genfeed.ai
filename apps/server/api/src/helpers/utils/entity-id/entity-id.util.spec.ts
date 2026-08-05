import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import type { IAuthPublicMetadata } from '@libs/interfaces/auth-public-metadata.interface';

describe('EntityIdUtil', () => {
  describe('validate', () => {
    it('should validate a supported entity id', () => {
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

    it('should throw error for an invalid entity id', () => {
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
    it('should validate an array of supported entity ids', () => {
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

    it('should throw error with the index for an invalid entity id', () => {
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
    it('should return true for a supported entity id', () => {
      expect(EntityIdUtil.isValid('507f1f77bcf86cd799439011')).toBe(true);
    });

    it('should return false for an invalid entity id', () => {
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

  describe('resolveCanonicalId', () => {
    it('returns the canonical Prisma id from a lookup result', () => {
      expect(
        EntityIdUtil.resolveCanonicalId(
          { id: 'canonical-cuid' },
          '507f1f77bcf86cd799439011',
        ),
      ).toBe('canonical-cuid');
    });

    it('falls back to the requested id when the record has no canonical id', () => {
      expect(
        EntityIdUtil.resolveCanonicalId({}, '507f1f77bcf86cd799439011'),
      ).toBe('507f1f77bcf86cd799439011');
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
      expect(result.userId).toEqual(expect.any(String));
      expect(result.organizationId).toEqual(expect.any(String));
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

      expect(result.userId).toEqual(expect.any(String));
      expect(result.organizationId).toBeUndefined();
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
    it('should accept a supported entity id string', async () => {
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

    it('should throw error for an invalid entity id string', async () => {
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
});
