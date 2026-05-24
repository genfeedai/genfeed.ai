import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';

/**
 * Utility class for legacy id validation and conversion.
 * The name is kept for compatibility with existing callsites.
 */
export class ObjectIdUtil {
  // Common field names that should be validated as entity IDs
  private static readonly OBJECTID_FIELDS = [
    '_id',
    'id',
    'user',
    'organization',
    'brand',
    'parent',
    'folder',
    'metadata',
    'video',
    'asset',
    'caption',
    'ingredient',
    'post',
  ];

  /**
   * Validate that a string is a supported entity id.
   */
  static validate(id: string, fieldName: string = 'id'): string {
    if (!id || typeof id !== 'string') {
      throw new ValidationException(
        `${fieldName} is required and must be a string`,
      );
    }

    if (!isEntityId(id)) {
      throw new ValidationException(
        `Invalid ${fieldName} format. Must be a valid entity id.`,
      );
    }

    return id;
  }

  /**
   * Validate multiple entity IDs at once.
   */
  static validateMany(ids: string[], fieldName: string = 'ids'): string[] {
    if (!Array.isArray(ids)) {
      throw new ValidationException(`${fieldName} must be an array`);
    }

    if (ids.length === 0) {
      throw new ValidationException(`${fieldName} array cannot be empty`);
    }

    return ids.map((id, index) =>
      ObjectIdUtil.validate(id, `${fieldName}[${index}]`),
    );
  }

  /**
   * Process search parameters and validate known id fields with caching.
   */
  static async processSearchParams(
    params: BaseQueryDto,
  ): Promise<BaseQueryDto> {
    const processed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (ObjectIdUtil.OBJECTID_FIELDS.includes(key)) {
        if (value && typeof value === 'string') {
          try {
            const validated = await Promise.resolve(
              ObjectIdUtil.validate(value, key),
            );
            processed[key] = validated;
          } catch {
            processed[key] = value;
          }
        } else if (Array.isArray(value)) {
          // Handle arrays of ids (e.g., for in queries)
          processed[key] = value.map((item) => {
            if (isEntityId(item)) {
              return item;
            }
            return item;
          });
        } else {
          processed[key] = value;
        }
      } else {
        processed[key] = value;
      }
    }

    // @ts-expect-error TS2739
    return processed;
  }

  /**
   * Safely validate string id without throwing.
   */
  static toObjectId(id: string): string | null {
    if (!isEntityId(id)) {
      return null;
    }

    return id;
  }

  /**
   * Normalize a value to an id string, handling various input types.
   * Returns undefined for invalid/empty values (does not throw).
   */
  static normalizeToObjectId(
    value: string | string | null | undefined,
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    if (value === '__never__') {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') {
        return undefined;
      }
      try {
        return trimmed;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Normalize an array of values to id strings, filtering out invalid entries.
   */
  static normalizeArrayToObjectIds(
    values: Array<string | null | undefined> | undefined,
  ): string[] | undefined {
    if (!values || !Array.isArray(values)) {
      return undefined;
    }

    const normalized = values
      .map((v) => ObjectIdUtil.normalizeToObjectId(v))
      .filter((v): v is string => v !== undefined);

    return normalized;
  }

  /**
   * Check if a value is a supported entity id string.
   */
  static isValid(id: unknown): id is string {
    return isEntityId(id);
  }

  /**
   * Convert id to string safely.
   */
  static toString(id: string | { toString(): string }): string {
    if (typeof id === 'string') {
      return id;
    }
    return id.toString();
  }

  /**
   * Validate and enrich DTO with user context
   */
  static enrichWithUserContext(
    dto: Record<string, unknown>,
    publicMetadata: IClerkPublicMetadata,
  ): Record<string, unknown> {
    if (!publicMetadata?.user) {
      throw new ValidationException('User context is required');
    }

    return {
      ...dto,
      organization: publicMetadata.organization
        ? ObjectIdUtil.validate(publicMetadata.organization, 'organization')
        : undefined,
      user: ObjectIdUtil.validate(publicMetadata.user, 'user'),
    };
  }

  /**
   * Validate pagination parameters
   */
  static validatePaginationParams(
    page?: number,
    limit?: number,
  ): {
    page: number;
    limit: number;
  } {
    const validatedPage = Math.max(1, Math.floor(Number(page) || 1));
    const validatedLimit = Math.min(
      100,
      Math.max(1, Math.floor(Number(limit) || 10)),
    );

    if (validatedPage > 10000) {
      throw new ValidationException(
        'Page number is too large. Maximum allowed is 10000.',
      );
    }

    return {
      limit: validatedLimit,
      page: validatedPage,
    };
  }

  /**
   * Create a secure query object with id validation and caching.
   */
  static async createSecureQuery(
    baseQuery: Record<string, unknown>,
    userContext?: IClerkPublicMetadata,
  ): Promise<Record<string, unknown>> {
    const processedQuery: Record<string, unknown> =
      (await ObjectIdUtil.processSearchParams(
        baseQuery as unknown as BaseQueryDto,
      )) as unknown as Record<string, unknown>;

    // Add user context if provided
    if (userContext) {
      processedQuery.user = await ObjectIdUtil.validate(
        userContext.user,
        'user',
      );
      if (userContext.organization) {
        processedQuery.organization = await ObjectIdUtil.validate(
          userContext.organization,
          'organization',
        );
      }
    }

    // Always exclude deleted items by default
    if (!Object.hasOwn(processedQuery, 'isDeleted')) {
      processedQuery.isDeleted = false;
    }

    return processedQuery;
  }

  /**
   * Validate array of entity ids for bulk operations.
   */
  static validateBulkIds(ids: string[], maxCount: number = 100): string[] {
    if (!Array.isArray(ids)) {
      throw new ValidationException('IDs must be provided as an array');
    }

    if (ids.length === 0) {
      throw new ValidationException('At least one ID must be provided');
    }

    if (ids.length > maxCount) {
      throw new ValidationException(
        `Too many IDs provided. Maximum allowed is ${maxCount}`,
      );
    }

    return ObjectIdUtil.validateMany(ids, 'ids');
  }

  /**
   * Convert relationship id field (parent, folder, etc.) from various input types.
   * Handles: string ids, null (remove relationship), empty objects, invalid data.
   */
  static async convertRelationshipField(
    value: unknown,
    fieldName: string,
  ): Promise<string | null> {
    // Handle null, undefined, or empty string - remove relationship
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // Handle valid string id
    if (typeof value === 'string') {
      return await Promise.resolve(ObjectIdUtil.validate(value, fieldName));
    }

    // Handle empty object {} - treat as null (remove relationship)
    if (
      typeof value === 'object' &&
      value !== null &&
      Object.keys(value).length === 0
    ) {
      return null;
    }

    // Handle invalid objects or other types
    if (typeof value === 'object' && value !== null) {
      throw new ValidationException(
        `Invalid ${fieldName} format. Must be a valid entity id string or null`,
      );
    }

    // Handle other invalid types
    throw new ValidationException(
      `Invalid ${fieldName} type. Expected string, null, or undefined, got ${typeof value}`,
    );
  }
}
