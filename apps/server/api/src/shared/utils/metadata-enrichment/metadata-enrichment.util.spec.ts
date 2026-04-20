import { MetadataEnrichmentUtil } from '@api/shared/utils/metadata-enrichment/metadata-enrichment.util';
import { describe, expect, it } from 'vitest';

const validUserId = '507f1f77bcf86cd799439011';
const validOrgId = '507f1f77bcf86cd799439012';
const validBrandId = '507f1f77bcf86cd799439013';

describe('MetadataEnrichmentUtil', () => {
  describe('enrichIds()', () => {
    it('returns string IDs', () => {
      const result = MetadataEnrichmentUtil.enrichIds({
        organization: validOrgId,
        user: validUserId,
      });

      expect(typeof result.user).toBe('string');
      expect(typeof result.organization).toBe('string');
      expect(result.user).toBe(validUserId);
    });

    it('includes brand when brand is provided', () => {
      const result = MetadataEnrichmentUtil.enrichIds({
        brand: validBrandId,
        organization: validOrgId,
        user: validUserId,
      });

      expect(typeof result.brand).toBe('string');
      expect(result.brand).toBe(validBrandId);
    });

    it('brand is undefined when not provided', () => {
      const result = MetadataEnrichmentUtil.enrichIds({
        organization: validOrgId,
        user: validUserId,
      });

      expect(result.brand).toBeUndefined();
    });

    it('throws when user is missing', () => {
      expect(() =>
        MetadataEnrichmentUtil.enrichIds({
          organization: validOrgId,
          user: '',
        }),
      ).toThrow();
    });

    it('throws when organization is missing', () => {
      expect(() =>
        MetadataEnrichmentUtil.enrichIds({
          organization: '',
          user: validUserId,
        }),
      ).toThrow();
    });
  });

  describe('enrichDto()', () => {
    it('enriches a DTO with user, org, and brand string IDs', () => {
      const dto = { label: 'Test' };
      const result = MetadataEnrichmentUtil.enrichDto(dto, {
        brand: validBrandId,
        organization: validOrgId,
        user: validUserId,
      });

      expect(result.label).toBe('Test');
      expect(result.user).toBe(validUserId);
      expect(result.organization).toBe(validOrgId);
      expect(result.brand).toBe(validBrandId);
    });

    it('preserves original dto properties', () => {
      const dto = { label: 'Test', value: 42 };
      const result = MetadataEnrichmentUtil.enrichDto(dto, {
        organization: validOrgId,
        user: validUserId,
      });

      expect(result.label).toBe('Test');
      expect(result.value).toBe(42);
    });
  });

  describe('buildOwnershipQuery()', () => {
    it('returns query with organization by default', () => {
      const query = MetadataEnrichmentUtil.buildOwnershipQuery({
        organization: validOrgId,
        user: validUserId,
      });

      expect(query).toHaveProperty('organization');
    });

    it('includes user when includeUser option is true', () => {
      const query = MetadataEnrichmentUtil.buildOwnershipQuery(
        { organization: validOrgId, user: validUserId },
        { includeUser: true },
      );

      expect(query).toHaveProperty('user');
      expect(query).toHaveProperty('organization');
    });

    it('includes isDeleted when includeIsDeleted is true', () => {
      const query = MetadataEnrichmentUtil.buildOwnershipQuery(
        { organization: validOrgId, user: validUserId },
        { includeIsDeleted: true },
      );

      expect(query).toHaveProperty('isDeleted');
    });
  });
});
