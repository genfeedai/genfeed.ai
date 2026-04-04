import { describe, expect, it } from 'vitest';
import { FormFieldCategory } from '../src/form.enum';

describe('form.enum', () => {
  describe('FormFieldCategory', () => {
    it('should have 9 members', () => {
      expect(Object.values(FormFieldCategory)).toHaveLength(9);
    });

    it('should have correct values', () => {
      expect(FormFieldCategory.TEXT).toBe('text');
      expect(FormFieldCategory.EMAIL).toBe('email');
      expect(FormFieldCategory.URL).toBe('url');
      expect(FormFieldCategory.NUMBER).toBe('number');
      expect(FormFieldCategory.PASSWORD).toBe('password');
      expect(FormFieldCategory.TEXTAREA).toBe('textarea');
      expect(FormFieldCategory.SELECT).toBe('select');
      expect(FormFieldCategory.CHECKBOX).toBe('checkbox');
      expect(FormFieldCategory.RADIO).toBe('radio');
    });
  });
});
