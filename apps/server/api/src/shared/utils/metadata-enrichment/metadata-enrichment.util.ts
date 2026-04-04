import { Types } from 'mongoose';

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
 * Enriched metadata with ObjectIds
 */
export interface EnrichedMetadata {
  user: Types.ObjectId;
  organization: Types.ObjectId;
  brand?: Types.ObjectId;
}

/**
 * MetadataEnrichmentUtil - Utility for enriching entities with user metadata
 *
 * Consolidates common patterns for converting Clerk public metadata strings
 * to MongoDB ObjectIds and enriching DTOs/entities.
 *
 * @example
 * // Get enriched ObjectIds from public metadata
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
   * Convert public metadata strings to ObjectIds
   *
   * @param publicMetadata - Clerk public metadata with string IDs
   * @returns Object with ObjectId versions
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
      brand: publicMetadata.brand
        ? new Types.ObjectId(publicMetadata.brand)
        : undefined,
      organization: new Types.ObjectId(publicMetadata.organization),
      user: new Types.ObjectId(publicMetadata.user),
    };
  }

  /**
   * Safely convert string ID to ObjectId (returns undefined if invalid)
   *
   * @param id - String ID or undefined
   * @returns ObjectId or undefined
   *
   * @example
   * const orgId = MetadataEnrichmentUtil.toObjectId('507f1f77bcf86cd799439011');
   * const invalidId = MetadataEnrichmentUtil.toObjectId(undefined); // undefined
   */
  static toObjectId(id?: string): Types.ObjectId | undefined {
    if (!id) {
      return undefined;
    }
    try {
      return new Types.ObjectId(id);
    } catch {
      return undefined;
    }
  }

  /**
   * Convert string ID to ObjectId (throws if invalid)
   *
   * @param id - String ID
   * @param fieldName - Field name for error message
   * @returns ObjectId
   * @throws Error if ID is invalid
   *
   * @example
   * const orgId = MetadataEnrichmentUtil.requireObjectId('507f...', 'organization');
   */
  static requireObjectId(id: string, fieldName: string): Types.ObjectId {
    if (!id) {
      throw new Error(`${fieldName} is required`);
    }
    try {
      return new Types.ObjectId(id);
    } catch {
      throw new Error(`Invalid ${fieldName} ID: ${id}`);
    }
  }

  /**
   * Enrich a DTO/entity with user metadata
   *
   * Adds user, organization, and optionally brand from public metadata.
   *
   * @param dto - Original DTO/entity
   * @param publicMetadata - Clerk public metadata
   * @param options - Enrichment options
   * @returns Enriched DTO with ObjectIds
   *
   * @example
   * const enrichedDto = MetadataEnrichmentUtil.enrichDto(
   *   { label: 'My Item' },
   *   publicMetadata,
   *   { includeBrand: true }
   * );
   * // Returns: { label: 'My Item', user: ObjectId(...), organization: ObjectId(...), brand: ObjectId(...) }
   */
  static enrichDto<T extends Record<string, unknown>>(
    dto: T,
    publicMetadata: ClerkPublicMetadata,
    options: { includeBrand?: boolean; includeUser?: boolean } = {},
  ): T & Partial<EnrichedMetadata> {
    const { includeBrand = true, includeUser = true } = options;

    const enriched: T & Partial<EnrichedMetadata> = { ...dto };

    if (publicMetadata.organization) {
      enriched.organization = new Types.ObjectId(publicMetadata.organization);
    }

    if (includeUser && publicMetadata.user) {
      enriched.user = new Types.ObjectId(publicMetadata.user);
    }

    if (includeBrand && publicMetadata.brand) {
      enriched.brand = new Types.ObjectId(publicMetadata.brand);
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
   * // Returns: { organization: ObjectId(...), isDeleted: false }
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
      query.organization = new Types.ObjectId(publicMetadata.organization);
    }

    if (includeUser && publicMetadata.user) {
      query.user = new Types.ObjectId(publicMetadata.user);
    }

    if (includeBrand && publicMetadata.brand) {
      query.brand = new Types.ObjectId(publicMetadata.brand);
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
    user?: string | Types.ObjectId | { _id?: Types.ObjectId };
  }): string | undefined {
    if (!source.user) {
      return undefined;
    }

    if (typeof source.user === 'string') {
      return source.user;
    }

    if (source.user instanceof Types.ObjectId) {
      return source.user.toString();
    }

    if (typeof source.user === 'object' && source.user._id) {
      return source.user._id.toString();
    }

    return undefined;
  }
}
