/**
 * Public metadata from Clerk user
 */
export interface ClerkPublicMetadata {
  user?: string;
  organization?: string;
  brand?: string;
  isSuperAdmin?: boolean;
}

/**
 * Enriched metadata with string IDs (Prisma uses string IDs)
 */
export interface EnrichedMetadata {
  user: string;
  organization: string;
  brand?: string;
}

/**
 * MetadataEnrichmentUtil - Utility for enriching entities with user metadata
 *
 * Consolidates common patterns for converting Clerk public metadata strings
 * to IDs and enriching DTOs/entities.
 *
 * @example
 * // Get enriched IDs from public metadata
 * const { user, organization, brand } = MetadataEnrichmentUtil.enrichIds(publicMetadata);
 *
 * // Enrich a DTO with metadata
 * const enrichedDto = MetadataEnrichmentUtil.enrichDto(createDto, publicMetadata);
 *
 * // Build base query with ownership
 * const baseQuery = MetadataEnrichmentUtil.buildOwnershipQuery(publicMetadata);
 */
export class MetadataEnrichmentUtil {
  /**
   * Convert public metadata strings to ID strings
   *
   * @param publicMetadata - Clerk public metadata with string IDs
   * @returns Object with string ID versions
   *
   * @example
   * const { user, organization, brand } = MetadataEnrichmentUtil.enrichIds({
   *   user: '507f1f77bcf86cd799439011',
   *   organization: '507f1f77bcf86cd799439012',
   *   brand: '507f1f77bcf86cd799439013'
   * });
   */
  static enrichIds(publicMetadata: ClerkPublicMetadata): EnrichedMetadata {
    if (!publicMetadata.user || !publicMetadata.organization) {
      throw new Error('User and organization are required in public metadata');
    }

    return {
      brand: publicMetadata.brand,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    };
  }

  /**
   * Safely return an ID string (returns undefined if falsy)
   *
   * @param id - String ID or undefined
   * @returns String ID or undefined
   *
   * @example
   * const orgId = MetadataEnrichmentUtil.toObjectId('507f1f77bcf86cd799439011');
   * const invalidId = MetadataEnrichmentUtil.toObjectId(undefined); // undefined
   */
  static toObjectId(id?: string): string | undefined {
    if (!id) {
      return undefined;
    }
    return id;
  }

  /**
   * Return ID string (throws if falsy or invalid format)
   *
   * @param id - String ID
   * @param fieldName - Field name for error message
   * @returns String ID
   * @throws Error if ID is falsy
   *
   * @example
   * const orgId = MetadataEnrichmentUtil.requireObjectId('507f...', 'organization');
   */
  static requireObjectId(id: string, fieldName: string): string {
    if (!id) {
      throw new Error(`${fieldName} is required`);
    }
    return id;
  }

  /**
   * Enrich a DTO/entity with user metadata
   *
   * Adds user, organization, and optionally brand from public metadata.
   *
   * @param dto - Original DTO/entity
   * @param publicMetadata - Clerk public metadata
   * @param options - Enrichment options
   * @returns Enriched DTO with string IDs
   *
   * @example
   * const enrichedDto = MetadataEnrichmentUtil.enrichDto(
   *   { label: 'My Item' },
   *   publicMetadata,
   *   { includeBrand: true }
   * );
   * // Returns: { label: 'My Item', user: '...', organization: '...', brand: '...' }
   */
  static enrichDto<T extends Record<string, unknown>>(
    dto: T,
    publicMetadata: ClerkPublicMetadata,
    options: { includeBrand?: boolean; includeUser?: boolean } = {},
  ): T & Partial<EnrichedMetadata> {
    const { includeBrand = true, includeUser = true } = options;

    const enriched: T & Partial<EnrichedMetadata> = { ...dto };

    if (publicMetadata.organization) {
      enriched.organization = publicMetadata.organization;
    }

    if (includeUser && publicMetadata.user) {
      enriched.user = publicMetadata.user;
    }

    if (includeBrand && publicMetadata.brand) {
      enriched.brand = publicMetadata.brand;
    }

    return enriched;
  }

  /**
   * Build base ownership query
   *
   * Creates standard query for documents owned by user/organization.
   *
   * @param publicMetadata - Clerk public metadata
   * @param options - Query options
   * @returns Query object with ownership conditions
   *
   * @example
   * const query = MetadataEnrichmentUtil.buildOwnershipQuery(publicMetadata, {
   *   includeIsDeleted: true
   * });
   * // Returns: { organization: '...', isDeleted: false }
   */
  static buildOwnershipQuery(
    publicMetadata: ClerkPublicMetadata,
    options: {
      includeIsDeleted?: boolean;
      includeBrand?: boolean;
      includeUser?: boolean;
    } = {},
  ): Record<string, unknown> {
    const {
      includeBrand = false,
      includeIsDeleted = true,
      includeUser = false,
    } = options;

    const query: Record<string, unknown> = {};

    if (publicMetadata.organization) {
      query.organization = publicMetadata.organization;
    }

    if (includeUser && publicMetadata.user) {
      query.user = publicMetadata.user;
    }

    if (includeBrand && publicMetadata.brand) {
      query.brand = publicMetadata.brand;
    }

    if (includeIsDeleted) {
      query.isDeleted = false;
    }

    return query;
  }

  /**
   * Extract user ID from various sources
   *
   * @param source - Object containing user reference
   * @returns String user ID or undefined
   */
  static extractUserId(source: {
    user?: string | { _id?: string };
  }): string | undefined {
    if (!source.user) {
      return undefined;
    }

    if (typeof source.user === 'string') {
      return source.user;
    }

    if (typeof source.user === 'object' && source.user._id) {
      return source.user._id;
    }

    return undefined;
  }
}
