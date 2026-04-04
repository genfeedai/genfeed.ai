import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  User: class BaseUser {
    public firstName?: string;
    public lastName?: string;
    constructor(
      partial: Partial<{ firstName?: string; lastName?: string }> = {},
    ) {
      Object.assign(this, partial);
    }
  },
}));

import { User } from '@models/auth/user.model';

describe('User', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new User({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new User({
        firstName: 'John',
        lastName: 'Doe',
      } as never);
      expect(instance.firstName).toBe('John');
      expect(instance.lastName).toBe('Doe');
    });
  });

  describe('fullName', () => {
    it('should return combined first and last name', () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
      } as never);
      expect(user.fullName).toBe('John Doe');
    });

    it('should return first name only when last name is missing', () => {
      const user = new User({ firstName: 'Jane' } as never);
      expect(user.fullName).toBe('Jane');
    });

    it('should return last name only when first name is missing', () => {
      const user = new User({ lastName: 'Smith' } as never);
      expect(user.fullName).toBe('Smith');
    });

    it('should return "-" when both names are missing', () => {
      const user = new User({} as never);
      expect(user.fullName).toBe('-');
    });

    it('should return "-" when both names are null', () => {
      const user = new User({
        firstName: null,
        lastName: null,
      } as never);
      expect(user.fullName).toBe('-');
    });

    it('should return "-" when both names are undefined', () => {
      const user = new User({
        firstName: undefined,
        lastName: undefined,
      } as never);
      expect(user.fullName).toBe('-');
    });

    it('should trim extra whitespace', () => {
      const user = new User({ firstName: '  Alice  ' } as never);
      expect(user.fullName).toBe('Alice');
    });
  });
});
