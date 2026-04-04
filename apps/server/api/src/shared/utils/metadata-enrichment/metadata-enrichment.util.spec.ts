import { MetadataEnrichmentUtil } from '@api/shared/utils/metadata-enrichment/metadata-enrichment.util';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

const validUserId = new Types.ObjectId().toHexString();
const validOrgId = new Types.ObjectId().toHexString();
const validBrandId = new Types.ObjectId().toHexString();

describe('MetadataEnrichmentUtil', () => {
  describe('enrichIds()', () => {
    it('converts string IDs to ObjectIds', () => {
      const result = MetadataEnrichmentUtil.enrichIds({
        organization: validOrgId,
        user: validUserId,
      });

      expect(result.user).toBeInstanceOf(Types.ObjectId);
      expect(result.organization).toBeInstanceOf(Types.ObjectId);
      expect(result.user.toHexString()).toBe(validUserId);
    });

    it('includes brand ObjectId when brand is provided', () => {
      const result = MetadataEnrichmentUtil.enrichIds({
        brand: validBrandId,
        organization: validOrgId,
        user: validUserId,
      });

      expect(result.brand).toBeInstanceOf(Types.ObjectId);
      expect(result.brand?.toHexString()).toBe(validBrandId);
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
    it('enriches a DTO with user, org, and brand ObjectIds', () => {
      const dto = { label: 'Test' };
      const result = MetadataEnrichmentUtil.enrichDto(dto, {
        brand: validBrandId,
        organization: validOrgId,
        user: validUserId,
      });

      expect(result.label).toBe('Test');
      expect(result.user).toBeInstanceOf(Types.ObjectId);
      expect(result.organization).toBeInstanceOf(Types.ObjectId);
      expect(result.brand).toBeInstanceOf(Types.ObjectId);
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
    it('returns query with organization ObjectId by default', () => {
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
