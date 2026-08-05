import { PresetFilterUtil } from '@api/helpers/utils/preset-filter/preset-filter.util';

describe('PresetFilterUtil', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('buildScopeOrConditions', () => {
    it('includes global and organization scopes', () => {
      const organization = '507f191e810c19729de860ee';
      const user = '507f191e810c19729de860ee';

      const conditions = PresetFilterUtil.buildScopeOrConditions({
        organization,
        user,
      });

      expect(conditions).toHaveLength(2);
      expect(conditions[0]).toEqual({ organizationId: null });
      expect(conditions[1].organizationId).toBe(organization);
    });

    it('falls back to global scope when metadata empty', () => {
      const conditions = PresetFilterUtil.buildScopeOrConditions({});
      expect(conditions).toEqual([{ organizationId: null }]);
    });
  });

  describe('canUserModifyPreset', () => {
    it('allows superadmin to modify any preset', () => {
      const canModify = PresetFilterUtil.canUserModifyPreset(
        { publicMetadata: { isSuperAdmin: true } },
        { organizationId: null },
      );
      expect(canModify).toBe(true);
    });

    it('blocks non-admin from modifying global presets', () => {
      const canModify = PresetFilterUtil.canUserModifyPreset(
        { publicMetadata: { isSuperAdmin: false, organization: 'org1' } },
        { organizationId: null },
      );
      expect(canModify).toBe(false);
    });

    it('allows modification when organizations match', () => {
      const orgId = '507f191e810c19729de860ee';
      const canModify = PresetFilterUtil.canUserModifyPreset(
        {
          publicMetadata: {
            isSuperAdmin: false,
            organization: orgId,
          },
        },
        { organizationId: orgId },
      );
      expect(canModify).toBe(true);
    });
  });

  describe('enrichPresetDto', () => {
    it('assigns canonical organization and brand ids for regular users', () => {
      const orgId = '507f191e810c19729de860ee';
      const brandId = '507f191e810c19729de860ee';

      const enriched = PresetFilterUtil.enrichPresetDto(
        { brandId, label: 'My Preset' },
        { publicMetadata: { isSuperAdmin: false, organization: orgId } },
      );

      expect(enriched.organizationId).toBe(orgId);
      expect(enriched.brandId).toBe(brandId);
    });

    it('keeps null organization/brand for superadmin global presets', () => {
      const enriched = PresetFilterUtil.enrichPresetDto(
        { label: 'Global' },
        { publicMetadata: { isSuperAdmin: true } },
      );

      expect(enriched.organizationId).toBeNull();
      expect(enriched.brandId).toBeNull();
    });

    it('converts provided organization/brand for superadmin org presets', () => {
      const org = '507f191e810c19729de860ee';
      const brandId = '507f191e810c19729de860ee';
      const enriched = PresetFilterUtil.enrichPresetDto(
        { brandId, label: 'Org preset', organizationId: org },
        { publicMetadata: { isSuperAdmin: true } },
      );

      expect(enriched.organizationId).toBe(org);
      expect(enriched.brandId).toBe(brandId);
    });
  });

  describe('buildBaseMatch', () => {
    it('builds match object with filters and scope', () => {
      const organization = '507f191e810c19729de860ee';
      const user = '507f191e810c19729de860ee';
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
      expect(match.OR).toHaveLength(2);
    });
  });
});
