import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { describe, expect, it } from 'vitest';

describe('form-error.helper', () => {
  describe('parseFormErrors', () => {
    it('returns empty array for no errors', () => {
      expect(parseFormErrors({})).toEqual([]);
    });

    it('parses a single field error with message', () => {
      const errors = {
        email: { message: 'Email is required', type: 'required' },
      };
      expect(parseFormErrors(errors)).toEqual(['email: Email is required']);
    });

    it('parses multiple field errors', () => {
      const errors = {
        email: { message: 'Invalid email', type: 'pattern' },
        name: { message: 'Name is required', type: 'required' },
      };
      const result = parseFormErrors(errors);
      expect(result).toHaveLength(2);
      expect(result).toContain('email: Invalid email');
      expect(result).toContain('name: Name is required');
    });

    it('handles nested errors', () => {
      const errors = {
        address: {
          city: { message: 'City required', type: 'required' },
          street: { message: 'Street required', type: 'required' },
        },
      };
      const result = parseFormErrors(errors as never);
      expect(result).toHaveLength(2);
      expect(result).toContain('address.city: City required');
      expect(result).toContain('address.street: Street required');
    });

    it('handles undefined field errors gracefully', () => {
      const errors = { field: undefined };
      expect(parseFormErrors(errors)).toEqual([]);
    });
  });

  describe('hasFormErrors', () => {
    it('returns false for empty errors object', () => {
      expect(hasFormErrors({})).toBe(false);
    });

    it('returns true when errors exist', () => {
      const errors = {
        email: { message: 'Required', type: 'required' },
      };
      expect(hasFormErrors(errors)).toBe(true);
    });

    it('returns true for multiple errors', () => {
      const errors = {
        a: { message: 'err a', type: 'required' },
        b: { message: 'err b', type: 'required' },
      };
      expect(hasFormErrors(errors)).toBe(true);
    });
  });
});
