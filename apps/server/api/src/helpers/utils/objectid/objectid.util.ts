import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { CacheResult } from '@api/helpers/utils/cache/cache.util';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import { Types } from 'mongoose';

/**
 * Utility class for ObjectId validation and conversion
 */
export class ObjectIdUtil {
  // Common field names that should be validated as ObjectIds
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
   * Validate that a string is a valid ObjectId
   */
  static validate(id: string, fieldName: string = 'id'): Types.ObjectId {
    if (!id || typeof id !== 'string') {
      throw new ValidationException(
        `${fieldName} is required and must be a string`,
      );
    }

    if (!Types.ObjectId.isValid(id)) {
      throw new ValidationException(
        `Invalid ${fieldName} format. Must be a valid ObjectId.`,
      );
    }

    return new Types.ObjectId(id);
  }

  /**
   * Validate multiple ObjectIds at once
   */
  static validateMany(
    ids: string[],
    fieldName: string = 'ids',
  ): Types.ObjectId[] {
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
   * Process search parameters and convert known ObjectId fields with caching
   */
  @CacheResult({
    keyGenerator: (...args: unknown[]) => {
      const [params = {}] = args as [Record<string, unknown>?];
      return `searchParams:${JSON.stringify(params)}`;
    },
    ttl: 300_000, // 5 minutes cache
  })
  static async processSearchParams(
    params: BaseQueryDto,
  ): Promise<BaseQueryDto> {
    const processed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (ObjectIdUtil.OBJECTID_FIELDS.includes(key)) {
        if (value && typeof value === 'string') {
          try {
            // Await validate in case CacheResult decorator makes it async
            const validated = await Promise.resolve(
              ObjectIdUtil.validate(value, key),
            );
            processed[key] = validated;
          } catch {
            // If ObjectId validation fails, keep original value to let MongoDB handle it
            processed[key] = value;
          }
        } else if (Array.isArray(value)) {
          // Handle arrays of ObjectIds (e.g., for $in queries)
          processed[key] = value.map((item) => {
            if (typeof item === 'string' && Types.ObjectId.isValid(item)) {
              return new Types.ObjectId(item);
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
   * Safely convert string to ObjectId without throwing
   */
  static toObjectId(id: string): Types.ObjectId | null {
    if (!id || typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      return null;
    }

    return new Types.ObjectId(id);
  }

  /**
   * Normalize a value to ObjectId, handling various input types.
   * Returns undefined for invalid/empty values (does not throw).
   */
  static normalizeToObjectId(
    value: Types.ObjectId | string | null | undefined,
  ): Types.ObjectId | undefined {
    if (!value) {
      return undefined;
    }

    if (value instanceof Types.ObjectId) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') {
        return undefined;
      }
      try {
        return new Types.ObjectId(trimmed);
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Normalize an array of values to ObjectIds, filtering out invalid entries.
   */
  static normalizeArrayToObjectIds(
    values: Array<Types.ObjectId | string | null | undefined> | undefined,
  ): Types.ObjectId[] | undefined {
    if (!values || !Array.isArray(values)) {
      return undefined;
    }

    const normalized = values
      .map((v) => ObjectIdUtil.normalizeToObjectId(v))
      .filter((v): v is Types.ObjectId => v !== undefined);

    return normalized;
  }

  /**
   * Check if a value is a valid ObjectId string
   */
  static isValid(id: unknown): id is string {
    return typeof id === 'string' && Types.ObjectId.isValid(id);
  }

  /**
   * Convert ObjectId to string safely
   */
  static toString(id: Types.ObjectId | string): string {
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
   * Create a secure query object with proper ObjectId conversion and caching
   */
  @CacheResult({
    keyGenerator: (...args: unknown[]) => {
      const [baseQuery = {}, userContext] = args as [
        Record<string, unknown>?,
        IClerkPublicMetadata?,
      ];
      return `secureQuery:${JSON.stringify(userContext)}:${JSON.stringify(baseQuery)}`;
    },
    ttl: 300_000, // 5 minutes cache
  })
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
   * Validate array of ObjectId strings for bulk operations
   */
  static validateBulkIds(
    ids: string[],
    maxCount: number = 100,
  ): Types.ObjectId[] {
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
   * Convert relationship ObjectId field (parent, folder, etc.) from various input types
   * Handles: string ObjectIds, null (remove relationship), empty objects, invalid data
   */
  static async convertRelationshipField(
    value: unknown,
    fieldName: string,
  ): Promise<Types.ObjectId | null> {
    // Handle null, undefined, or empty string - remove relationship
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // Handle valid string ObjectId
    if (typeof value === 'string') {
      // Await validate in case CacheResult decorator makes it async
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
        `Invalid ${fieldName} format. Must be a valid ObjectId string or null`,
      );
    }

    // Handle other invalid types
    throw new ValidationException(
      `Invalid ${fieldName} type. Expected string, null, or undefined, got ${typeof value}`,
    );
  }
}
