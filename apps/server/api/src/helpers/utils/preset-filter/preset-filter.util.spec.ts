import { PresetFilterUtil } from '@api/helpers/utils/preset-filter/preset-filter.util';
import { Types } from 'mongoose';

describe('PresetFilterUtil', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('buildScopeOrConditions', () => {
    it('includes global, organization, and user scopes', () => {
      const organization = new Types.ObjectId().toHexString();
      const user = new Types.ObjectId().toHexString();

      const conditions = PresetFilterUtil.buildScopeOrConditions({
        organization,
        user,
      });

      expect(conditions).toHaveLength(3);
      expect(conditions[0]).toEqual({
        organization: { $exists: false },
        user: { $exists: false },
      });
      expect(conditions[1].organization.toHexString()).toBe(organization);
      expect(conditions[2].user.toHexString()).toBe(user);
    });

    it('falls back to global scope when metadata empty', () => {
      const conditions = PresetFilterUtil.buildScopeOrConditions({});
      expect(conditions).toEqual([
        { organization: { $exists: false }, user: { $exists: false } },
      ]);
    });
  });

  describe('canUserModifyPreset', () => {
    it('allows superadmin to modify any preset', () => {
      const canModify = PresetFilterUtil.canUserModifyPreset(
        { publicMetadata: { isSuperAdmin: true } },
        { organization: null },
      );
      expect(canModify).toBe(true);
    });

    it('blocks non-admin from modifying global presets', () => {
      const canModify = PresetFilterUtil.canUserModifyPreset(
        { publicMetadata: { isSuperAdmin: false, organization: 'org1' } },
        { organization: null },
      );
      expect(canModify).toBe(false);
    });

    it('allows modification when organizations match', () => {
      const orgId = new Types.ObjectId();
      const canModify = PresetFilterUtil.canUserModifyPreset(
        {
          publicMetadata: {
            isSuperAdmin: false,
            organization: orgId.toHexString(),
          },
        },
        { organization: orgId },
      );
      expect(canModify).toBe(true);
    });
  });

  describe('enrichPresetDto', () => {
    it('assigns organization/brand for regular users', () => {
      const orgId = new Types.ObjectId().toHexString();
      const brandId = new Types.ObjectId().toHexString();

      const enriched = PresetFilterUtil.enrichPresetDto(
        { brand: brandId, label: 'My Preset' },
        { publicMetadata: { isSuperAdmin: false, organization: orgId } },
      );

      expect(enriched.organization.toHexString()).toBe(orgId);
      expect(enriched.brand.toHexString()).toBe(brandId);
    });

    it('keeps null organization/brand for superadmin global presets', () => {
      const enriched = PresetFilterUtil.enrichPresetDto(
        { label: 'Global' },
        { publicMetadata: { isSuperAdmin: true } },
      );

      expect(enriched.organization).toBeNull();
      expect(enriched.brand).toBeNull();
    });

    it('converts provided organization/brand for superadmin org presets', () => {
      const org = new Types.ObjectId().toHexString();
      const brand = new Types.ObjectId().toHexString();
      const enriched = PresetFilterUtil.enrichPresetDto(
        { brand, label: 'Org preset', organization: org },
        { publicMetadata: { isSuperAdmin: true } },
      );

      expect(enriched.organization.toHexString()).toBe(org);
      expect(enriched.brand.toHexString()).toBe(brand);
    });
  });

  describe('buildBaseMatch', () => {
    it('builds match object with filters and scope', () => {
      const organization = new Types.ObjectId().toHexString();
      const user = new Types.ObjectId().toHexString();
      const match = PresetFilterUtil.buildBaseMatch(
        { organization, user },
        { category: 'video', isActive: true, isFavorite: false },
      );

      expect(match).toMatchObject({
        category: 'video',
        isActive: true,
        isDeleted: false,
        isFavorite: false,
      });
      expect(match.$or).toHaveLength(3);
    });
  });
});
