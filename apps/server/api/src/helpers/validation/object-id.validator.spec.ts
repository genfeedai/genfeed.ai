import { ObjectIdValidator } from '@api/helpers/validation/object-id.validator';

describe('ObjectIdValidator', () => {
  const validObjectId = '507f1f77bcf86cd799439011';
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
    it('should return true for valid ObjectId', () => {
      expect(ObjectIdValidator.isValid(validObjectId)).toBe(true);
    });

    it('should return false for invalid ObjectIds', () => {
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

    it('should return true for valid 24-character hex string', () => {
      const validHex = '507f1f77bcf86cd799439011';
      expect(ObjectIdValidator.isValid(validHex)).toBe(true);
    });

    it('should return false for valid hex but wrong length', () => {
      const shortHex = '507f1f77bcf86cd799439'; // 23 characters
      const longHex = '507f1f77bcf86cd7994390111'; // 25 characters
      expect(ObjectIdValidator.isValid(shortHex)).toBe(false);
      expect(ObjectIdValidator.isValid(longHex)).toBe(false);
    });
  });

  describe('areAllValid', () => {
    it('should return true for array of valid ObjectIds', () => {
      const validIds = [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013',
      ];
      expect(ObjectIdValidator.areAllValid(validIds)).toBe(true);
    });

    it('should return false if any ObjectId is invalid', () => {
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
    it('should return the id string for valid ObjectId', () => {
      const result = ObjectIdValidator.createObjectId(validObjectId);
      expect(typeof result).toBe('string');
      expect(result).toBe(validObjectId);
    });

    it('should throw error for invalid ObjectId string', () => {
      expect(() => ObjectIdValidator.createObjectId('invalid')).toThrow(
        'Invalid ObjectId: invalid',
      );
    });

    it('should throw error for empty string', () => {
      expect(() => ObjectIdValidator.createObjectId('')).toThrow(
        'Invalid ObjectId: ',
      );
    });
  });

  describe('safeCreateObjectId', () => {
    it('should return the id string for valid ObjectId', () => {
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
