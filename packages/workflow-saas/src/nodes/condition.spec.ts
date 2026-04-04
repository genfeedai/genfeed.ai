import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITION_DATA } from './condition';

describe('condition node', () => {
  describe('DEFAULT_CONDITION_DATA', () => {
    it('should have label set to Condition', () => {
      expect(DEFAULT_CONDITION_DATA.label).toBe('Condition');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_CONDITION_DATA.status).toBe('idle');
    });

    it('should have type set to condition', () => {
      expect(DEFAULT_CONDITION_DATA.type).toBe('condition');
    });

    it('should default field to custom', () => {
      expect(DEFAULT_CONDITION_DATA.field).toBe('custom');
    });

    it('should default operator to equals', () => {
      expect(DEFAULT_CONDITION_DATA.operator).toBe('equals');
    });

    it('should default value to empty string', () => {
      expect(DEFAULT_CONDITION_DATA.value).toBe('');
    });

    it('should default customField to empty string', () => {
      expect(DEFAULT_CONDITION_DATA.customField).toBe('');
    });

    it('should default expression to empty string', () => {
      expect(DEFAULT_CONDITION_DATA.expression).toBe('');
    });

    it('should default timezone to UTC', () => {
      expect(DEFAULT_CONDITION_DATA.timezone).toBe('UTC');
    });
  });
});
