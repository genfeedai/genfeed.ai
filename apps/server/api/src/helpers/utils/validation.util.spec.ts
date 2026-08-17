import {
  validateEmail,
  validateEntityId,
  validatePassword,
  validateUrl,
} from '@api/helpers/utils/validation.util';
import { testId } from '@helpers/testing/test-id.helper';

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

  describe('validateEntityId', () => {
    it('should return true for valid entity IDs', () => {
      expect(validateEntityId(testId('entity'))).toBe(true);
      // Hand-written cuid2-shaped id (24 chars, [a-z][a-z0-9]{23}) — testId's
      // fixed 25-char cuid shape can't represent this variant.
      expect(validateEntityId('a00000000000000000000001')).toBe(true);
      expect(validateEntityId('550e8400-e29b-41d4-a716-446655440000')).toBe(
        true,
      );
      // Hand-written ULID-shaped id (26 chars, Crockford base32).
      expect(validateEntityId('010000000000000000000000AA')).toBe(true);
    });

    it('should return false for invalid entity IDs', () => {
      expect(validateEntityId('invalid-id')).toBe(false);
      // Hand-written low-entropy ObjectId-shaped id (24 hex chars) — must stay
      // an ObjectId shape to test rejection; testId's cuid shape would pass.
      expect(validateEntityId('500000000000000000000001')).toBe(false);
      expect(validateEntityId('507f1f77bcf86cd79943901')).toBe(false);
      expect(validateEntityId('507f1f77bcf86cd7994390111')).toBe(false);
      expect(validateEntityId('')).toBe(false);
      expect(validateEntityId('507f1f77bcf86cd79943901g')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(validateEntityId(null)).toBe(false);
      expect(validateEntityId(undefined)).toBe(false);
      expect(validateEntityId(123)).toBe(false);
    });
  });
});
