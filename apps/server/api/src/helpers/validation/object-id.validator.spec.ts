import { ObjectIdValidator } from '@api/helpers/validation/object-id.validator';

describe('ObjectIdValidator', () => {
  const validObjectId = '507f1f77bcf86cd799439011';
  const validCuid = 'clv2f9w8d000008l4h9a1b2c3';
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';
  const invalidIds = [
    '',
    'invalid',
    '123',
    'not-an-objectid',
    '507f1f77bcf86cd7994390111234', // too long
    null,
    undefined,
    123,
    {},
    [],
  ];

  describe('isValid', () => {
    it('should return true for supported entity IDs', () => {
      expect(ObjectIdValidator.isValid(validObjectId)).toBe(true);
      expect(ObjectIdValidator.isValid(validCuid)).toBe(true);
      expect(ObjectIdValidator.isValid(validUuid)).toBe(true);
    });

    it('should return false for invalid entity IDs', () => {
      invalidIds.forEach((id) => {
        expect(ObjectIdValidator.isValid(id)).toBe(false);
      });
    });

    it('should return false for non-string inputs', () => {
      expect(ObjectIdValidator.isValid(null)).toBe(false);
      expect(ObjectIdValidator.isValid(undefined)).toBe(false);
      expect(ObjectIdValidator.isValid(123)).toBe(false);
      expect(ObjectIdValidator.isValid({})).toBe(false);
    });

    it('should return true for legacy 24-character hex string', () => {
      const validHex = '507f1f77bcf86cd799439011';
      expect(ObjectIdValidator.isValid(validHex)).toBe(true);
    });

    it('should return false for hex IDs with unsupported length', () => {
      const shortHex = '507f1f77bcf86cd799439'; // 23 characters
      const longHex = '507f1f77bcf86cd7994390111'; // 25 characters
      expect(ObjectIdValidator.isValid(shortHex)).toBe(false);
      expect(ObjectIdValidator.isValid(longHex)).toBe(false);
    });
  });

  describe('areAllValid', () => {
    it('should return true for array of valid entity IDs', () => {
      const validIds = ['507f1f77bcf86cd799439011', validCuid, validUuid];
      expect(ObjectIdValidator.areAllValid(validIds)).toBe(true);
    });

    it('should return false if any entity id is invalid', () => {
      const mixedIds = [validObjectId, 'invalid-id'];
      expect(ObjectIdValidator.areAllValid(mixedIds)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(ObjectIdValidator.areAllValid([])).toBe(false);
    });

    it('should return false for non-array input', () => {
      expect(ObjectIdValidator.areAllValid(null)).toBe(false);
      expect(ObjectIdValidator.areAllValid(undefined)).toBe(false);
      expect(ObjectIdValidator.areAllValid('not-array')).toBe(false);
    });
  });

  describe('createObjectId', () => {
    it('should return the id string for valid entity id', () => {
      const result = ObjectIdValidator.createObjectId(validObjectId);
      expect(typeof result).toBe('string');
      expect(result).toBe(validObjectId);
    });

    it('should throw error for invalid entity id string', () => {
      expect(() => ObjectIdValidator.createObjectId('invalid')).toThrow(
        'Invalid entity id: invalid',
      );
    });

    it('should throw error for empty string', () => {
      expect(() => ObjectIdValidator.createObjectId('')).toThrow(
        'Invalid entity id: ',
      );
    });
  });

  describe('safeCreateObjectId', () => {
    it('should return the id string for valid entity id', () => {
      const result = ObjectIdValidator.safeCreateObjectId(validObjectId);
      expect(typeof result).toBe('string');
      expect(result).toBe(validObjectId);
    });

    it('should return null for invalid ObjectId string', () => {
      expect(ObjectIdValidator.safeCreateObjectId('invalid')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(ObjectIdValidator.safeCreateObjectId('')).toBeNull();
    });

    it('should return null for non-string inputs', () => {
      expect(ObjectIdValidator.safeCreateObjectId(null)).toBeNull();
      expect(ObjectIdValidator.safeCreateObjectId(undefined)).toBeNull();
      expect(ObjectIdValidator.safeCreateObjectId(123)).toBeNull();
    });
  });
});
