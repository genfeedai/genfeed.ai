import { describe, expect, it } from 'vitest';
import { OrganizationCategory } from '../src/organization.enum';

describe('organization.enum', () => {
  describe('OrganizationCategory', () => {
    it('should have 3 members', () => {
      expect(Object.values(OrganizationCategory)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(OrganizationCategory.CREATOR).toBe('creator');
      expect(OrganizationCategory.BUSINESS).toBe('business');
      expect(OrganizationCategory.AGENCY).toBe('agency');
    });
  });
});
