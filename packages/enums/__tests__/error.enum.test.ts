import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../src/error.enum';

describe('error.enum', () => {
  describe('ErrorCode', () => {
    it('should have 16 members', () => {
      expect(Object.values(ErrorCode)).toHaveLength(16);
    });

    it('should have correct values', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCode.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
      expect(ErrorCode.INVALID_TOKEN).toBe('INVALID_TOKEN');
      expect(ErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ErrorCode.MISSING_REQUIRED_FIELD).toBe('MISSING_REQUIRED_FIELD');
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.ALREADY_EXISTS).toBe('ALREADY_EXISTS');
      expect(ErrorCode.CONFLICT).toBe('CONFLICT');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
      expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
      expect(ErrorCode.INSUFFICIENT_PERMISSIONS).toBe(
        'INSUFFICIENT_PERMISSIONS',
      );
      expect(ErrorCode.QUOTA_EXCEEDED).toBe('QUOTA_EXCEEDED');
      expect(ErrorCode.INVALID_OPERATION).toBe('INVALID_OPERATION');
    });
  });
});
