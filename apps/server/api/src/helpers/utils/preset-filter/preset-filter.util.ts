/**
 * PresetFilterUtil - Utility for building preset-specific query filters
 *
 * Provides reusable filter builders for preset query patterns.
 * Handles preset-specific logic like three-tier scope filtering (global, org, user).
 *
 * @example
 * // Build scope OR conditions
 * const orConditions = PresetFilterUtil.buildScopeOrConditions(publicMetadata);
 *
 * // Check user permissions
 * const canModify = PresetFilterUtil.canUserModifyPreset(user, preset);
 *
 * // Enrich create DTO
 * const enrichedDto = PresetFilterUtil.enrichPresetDto(createDto, user);
 */
export class PresetFilterUtil {
  /**
   * Build scope OR conditions for three-tier filtering
   *
   * Presets have three tiers of scope:
   * 1. Global items (no organization, no user)
   * 2. Organization items (specific organization)
   * 3. User items (specific user)
   *
   * This method builds OR conditions that include all accessible presets.
   *
   * @param publicMetadata - User metadata containing organization and user IDs
   * @returns Array of OR conditions for MongoDB query
   *
   * @example
   * // User with org and user ID
   * PresetFilterUtil.buildScopeOrConditions({ organization: '123', user: '456' })
   * // Returns: [
   * //   { organization: { not: false }, user: { not: false } }, // global
   * //   { organization: ObjectId('123') },                                // org-specific
   * //   { user: ObjectId('456') }                                         // user-specific
   * // ]
   *
   * @example
   * // User without organization (just user)
   * PresetFilterUtil.buildScopeOrConditions({ user: '456' })
   * // Returns: [
   * //   { organization: { not: false }, user: { not: false } }, // global
   * //   { user: ObjectId('456') }                                         // user-specific
   * // ]
   */
  static buildScopeOrConditions(publicMetadata: {
    organization?: string;
    user?: string;
  }): Array<Record<string, unknown>> {
    const orConditions: Array<Record<string, unknown>> = [
      { organization: { not: false }, user: { not: false } }, // global items
    ];

    if (publicMetadata.organization) {
      orConditions.push({
        organization: publicMetadata.organization,
      });
    }

    if (publicMetadata.user) {
      orConditions.push({ user: publicMetadata.user });
    }

    return orConditions;
  }

  /**
   * Check if user can modify preset
   *
   * Presets have specific modification rules:
   * - Superadmins can modify any preset
   * - Regular users can only modify presets in their organization
   * - Global presets (null organization) can ONLY be modified by superadmins
   *
   * @param user - User object with publicMetadata
   * @param preset - Preset entity to check
   * @returns True if user can modify preset, false otherwise
   *
   * @example
   * // Superadmin modifying any preset
   * PresetFilterUtil.canUserModifyPreset(
   *   { publicMetadata: { isSuperAdmin: true } },
   *   { organization: null }
   * )
   * // Returns: true
   *
   * @example
   * // Regular user modifying global preset
   * PresetFilterUtil.canUserModifyPreset(
   *   { publicMetadata: { isSuperAdmin: false, organization: '123' } },
   *   { organization: null }
   * )
   * // Returns: false
   *
   * @example
   * // Regular user modifying their org preset
   * PresetFilterUtil.canUserModifyPreset(
   *   { publicMetadata: { isSuperAdmin: false, organization: '123' } },
   *   { organization: '123' }
   * )
   * // Returns: true
   */
  static canUserModifyPreset(
    user: {
      publicMetadata: {
        isSuperAdmin?: boolean;
        organization?: string;
      };
    },
    preset: { organization?: string | null },
  ): boolean {
    const { isSuperAdmin, organization } = user.publicMetadata;

    // Superadmins can modify any preset
    if (isSuperAdmin) {
      return true;
    }

    // Default/global presets (null organization) can only be modified by admins
    if (!preset.organization) {
      return false;
    }

    // Check organization ownership for non-default presets
    const presetOrgId = preset.organization?.toString();
    return presetOrgId === organization;
  }

  /**
   * Enrich preset create DTO with proper organization/brand/user
   *
   * Handles preset creation logic based on user permissions:
   * - Non-superadmins: Always get their organization assigned
   * - Superadmins: Can create global, org-wide, or brand-specific presets
   *
   * @param createDto - Original create DTO
   * @param user - User object with publicMetadata
   * @returns Enriched DTO with proper organization/brand/user fields
   *
   * @example
   * // Regular user creating preset
   * PresetFilterUtil.enrichPresetDto(
   *   { label: 'My Preset', brand: '123' },
   *   { publicMetadata: { isSuperAdmin: false, organization: '456' } }
   * )
   * // Returns: { label: 'My Preset', organization: ObjectId('456'), brand: ObjectId('123') }
   *
   * @example
   * // Superadmin creating global preset
   * PresetFilterUtil.enrichPresetDto(
   *   { label: 'Global Preset' },
   *   { publicMetadata: { isSuperAdmin: true } }
   * )
   * // Returns: { label: 'Global Preset', organization: null, brand: null }
   *
   * @example
   * // Superadmin creating org-specific preset
   * PresetFilterUtil.enrichPresetDto(
   *   { label: 'Org Preset', organization: '456' },
   *   { publicMetadata: { isSuperAdmin: true } }
   * )
   * // Returns: { label: 'Org Preset', organization: ObjectId('456'), brand: null }
   */
  static enrichPresetDto(
    createDto: Record<string, unknown>,
    user: {
      publicMetadata: {
        isSuperAdmin?: boolean;
        organization?: string;
        brand?: string;
      };
    },
  ): Record<string, unknown> {
    const { isSuperAdmin, organization, brand } = user.publicMetadata;
    const enriched: Record<string, unknown> = { ...createDto };

    // Non-root users always get their organization assigned
    if (!isSuperAdmin) {
      enriched.organization = organization;

      // Convert brand string ID to ObjectId if provided
      if (enriched.brand) {
        enriched.brand = enriched.brand;
      }
    } else {
      // Superadmins can create:
      // 1. App-wide presets (no org, no brand)
      // 2. Org-wide presets (org but no brand)
      // 3. Brand-specific presets (org and brand)
      if (enriched.organization) {
        enriched.organization = enriched.organization;
      } else {
        enriched.organization = null;
      }

      if (enriched.brand) {
        enriched.brand = enriched.brand;
      } else {
        enriched.brand = null;
      }
    }

    return enriched;
  }

  /**
   * Build base match stage for presets
   *
   * Creates the base match stage including three-tier scope filtering
   * and optional filters for category, isActive, isFavorite.
   *
   * @param publicMetadata - User metadata
   * @param query - Query params with optional filters
   * @param isDeleted - Whether to include deleted items
   * @returns Match stage object for MongoDB aggregation
   *
   * @example
   * PresetFilterUtil.buildBaseMatch(
   *   { organization: '123', user: '456' },
   *   { category: 'video', isActive: true },
   *   false
   * )
   * // Returns: {
   * //   isDeleted: false,
   * //   category: 'video',
   * //   isActive: true,
   * //   OR: [...scope conditions...]
   * // }
   */
  static buildBaseMatch(
    publicMetadata: { organization?: string; user?: string },
    query: {
      category?: string;
      isActive?: boolean;
      isFavorite?: boolean;
    } = {},
    isDeleted: boolean = false,
  ): Record<string, unknown> {
    const matchStage: Record<string, unknown> = { isDeleted };

    // Filter by category if provided
    if (query.category) {
      matchStage.category = query.category;
    }

    // Filter by active status if provided
    if (typeof query.isActive === 'boolean') {
      matchStage.isActive = query.isActive;
    }

    // Filter by favorite status if provided
    if (typeof query.isFavorite === 'boolean') {
      matchStage.isFavorite = query.isFavorite;
    }

    // Add three-tier scope filtering
    matchStage.OR = PresetFilterUtil.buildScopeOrConditions(publicMetadata);

    return matchStage;
  }
}
