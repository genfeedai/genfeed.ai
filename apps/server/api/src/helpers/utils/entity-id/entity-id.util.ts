import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { IAuthPublicMetadata } from '@api/shared/interfaces/auth/auth-public-metadata.interface';

/**
 * Utility class for entity id validation and normalization.
 * Entity ids are string ids (cuid/cuid2/uuid/ulid, plus legacy 24-char hex
 * Mongo ids that survive as `mongoId` lookup aliases) — see `isEntityId`.
 */
export class EntityIdUtil {
  // Common field names that should be validated as entity IDs
  private static readonly ID_FIELDS = [
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
      EntityIdUtil.validate(id, `${fieldName}[${index}]`),
    );
  }

  /**
   * Process search parameters and validate known id fields.
   */
  static async processSearchParams(
    params: BaseQueryDto,
  ): Promise<BaseQueryDto> {
    const processed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (EntityIdUtil.ID_FIELDS.includes(key)) {
        if (value && typeof value === 'string') {
          try {
            const validated = await Promise.resolve(
              EntityIdUtil.validate(value, key),
            );
            processed[key] = validated;
          } catch {
            processed[key] = value;
          }
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
   * Safely validate a string id without throwing.
   */
  static toValidId(id: string): string | null {
    if (!isEntityId(id)) {
      return null;
    }

    return id;
  }

  /**
   * Normalize a value to an id string.
   * Returns undefined for invalid/empty values (does not throw).
   */
  static normalizeId(value: string | null | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    if (value === '__never__') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }

  /**
   * Normalize an array of values to id strings, filtering out invalid entries.
   */
  static normalizeIds(
    values: Array<string | null | undefined> | undefined,
  ): string[] | undefined {
    if (!values || !Array.isArray(values)) {
      return undefined;
    }

    return values
      .map((v) => EntityIdUtil.normalizeId(v))
      .filter((v): v is string => v !== undefined);
  }

  /**
   * Check if a value is a supported entity id string.
   */
  static isValid(id: unknown): id is string {
    return isEntityId(id);
  }

  /**
   * Validate and enrich DTO with user context
   */
  static enrichWithUserContext(
    dto: Record<string, unknown>,
    publicMetadata: IAuthPublicMetadata,
  ): Record<string, unknown> {
    if (!publicMetadata?.user) {
      throw new ValidationException('User context is required');
    }

    return {
      ...dto,
      organization: publicMetadata.organization
        ? EntityIdUtil.validate(publicMetadata.organization, 'organization')
        : undefined,
      user: EntityIdUtil.validate(publicMetadata.user, 'user'),
    };
  }

  /**
   * Create a secure query object with id validation.
   */
  static async createSecureQuery(
    baseQuery: Record<string, unknown>,
    userContext?: IAuthPublicMetadata,
  ): Promise<Record<string, unknown>> {
    const processedQuery: Record<string, unknown> =
      (await EntityIdUtil.processSearchParams(
        baseQuery as unknown as BaseQueryDto,
      )) as unknown as Record<string, unknown>;

    // Add user context if provided
    if (userContext) {
      processedQuery.user = await EntityIdUtil.validate(
        userContext.user,
        'user',
      );
      if (userContext.organization) {
        processedQuery.organization = await EntityIdUtil.validate(
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
      return await Promise.resolve(EntityIdUtil.validate(value, fieldName));
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
