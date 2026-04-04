import { describe, expect, it } from 'vitest';
import { EntityModel } from '../src/entity.enum';

describe('entity.enum', () => {
  describe('EntityModel', () => {
    it('should have 8 members', () => {
      expect(Object.values(EntityModel)).toHaveLength(8);
    });

    it('should have correct values', () => {
      expect(EntityModel.CREDENTIAL).toBe('Credential');
      expect(EntityModel.INGREDIENT).toBe('Ingredient');
      expect(EntityModel.ORGANIZATION).toBe('Organization');
      expect(EntityModel.USER).toBe('User');
      expect(EntityModel.BRAND).toBe('Brand');
      expect(EntityModel.ASSET).toBe('Asset');
      expect(EntityModel.TAG).toBe('Tag');
      expect(EntityModel.MEMBER).toBe('Member');
    });
  });
});
