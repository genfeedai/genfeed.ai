import {
  validateEmail,
  validateObjectId,
  validatePassword,
  validateUrl,
} from '@api/helpers/utils/validation.util';

describe('Validation Utils', () => {
  describe('validateEmail', () => {
    it('should return true for valid email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.org')).toBe(true);
    });

    it('should return false for invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('test@.com')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(validateEmail(null)).toBe(false);
      expect(validateEmail(undefined)).toBe(false);
      expect(validateEmail(123)).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should return true for valid passwords', () => {
      expect(validatePassword('Password123!')).toBe(true);
      expect(validatePassword('MySecurePass1@')).toBe(true);
      expect(validatePassword('ComplexP@ssw0rd')).toBe(true);
    });

    it('should return false for passwords that are too short', () => {
      expect(validatePassword('Pass1!')).toBe(false);
      expect(validatePassword('')).toBe(false);
    });

    it('should return false for passwords without uppercase', () => {
      expect(validatePassword('password123!')).toBe(false);
    });

    it('should return false for passwords without lowercase', () => {
      expect(validatePassword('PASSWORD123!')).toBe(false);
    });

    it('should return false for passwords without numbers', () => {
      expect(validatePassword('Password!')).toBe(false);
    });

    it('should return false for passwords without special characters', () => {
      expect(validatePassword('Password123')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(validatePassword(null)).toBe(false);
      expect(validatePassword(undefined)).toBe(false);
      expect(validatePassword(123)).toBe(false);
    });
  });

  describe('validateUrl', () => {
    it('should return true for valid URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('http://example.com')).toBe(true);
      expect(validateUrl('https://subdomain.example.com/path')).toBe(true);
      expect(validateUrl('https://example.com:8080/path?query=value')).toBe(
        true,
      );
    });

    it('should return false for invalid URLs', () => {
      expect(validateUrl('not-a-url')).toBe(false);
      expect(validateUrl('ftp://example.com')).toBe(false);
      expect(validateUrl('')).toBe(false);
      expect(validateUrl('example.com')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(validateUrl(null)).toBe(false);
      expect(validateUrl(undefined)).toBe(false);
      expect(validateUrl(123)).toBe(false);
    });
  });

  describe('validateObjectId', () => {
    it('should return true for valid MongoDB ObjectIds', () => {
      expect(validateObjectId('507f1f77bcf86cd799439011')).toBe(true);
      expect(validateObjectId('507f191e810c19729de860ea')).toBe(true);
      expect(validateObjectId('000000000000000000000000')).toBe(true);
    });

    it('should return false for invalid ObjectIds', () => {
      expect(validateObjectId('invalid-id')).toBe(false);
      expect(validateObjectId('507f1f77bcf86cd79943901')).toBe(false); // Too short
      expect(validateObjectId('507f1f77bcf86cd7994390111')).toBe(false); // Too long
      expect(validateObjectId('')).toBe(false);
      expect(validateObjectId('507f1f77bcf86cd79943901g')).toBe(false); // Invalid character
    });

    it('should handle edge cases', () => {
      expect(validateObjectId(null)).toBe(false);
      expect(validateObjectId(undefined)).toBe(false);
      expect(validateObjectId(123)).toBe(false);
    });
  });
});
