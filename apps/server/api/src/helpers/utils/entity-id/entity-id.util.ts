import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ValidationException } from '@api/exceptions/validation.exception';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';

/**
 * Utility class for entity id validation and normalization.
 * Entity ids are canonical Prisma string ids (cuid/cuid2/uuid/ulid) — see
 * `isEntityId`.
 */
export class EntityIdUtil {
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

  /** Resolve a canonical Prisma id, falling back to the requested id. */
  static resolveCanonicalId(entity: unknown, fallbackId: string): string {
    if (typeof entity !== 'object' || entity === null) {
      return fallbackId;
    }

    const canonicalId = (entity as Record<string, unknown>).id;
    return typeof canonicalId === 'string' && canonicalId.length > 0
      ? canonicalId
      : fallbackId;
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
    user: Pick<AuthenticatedUser, 'userId' | 'organizationId' | 'id'>,
  ): Record<string, unknown> {
    const userId = user.userId || user.id;
    if (!userId) {
      throw new ValidationException('User context is required');
    }

    return {
      ...dto,
      organizationId: user.organizationId
        ? EntityIdUtil.validate(user.organizationId, 'organizationId')
        : undefined,
      userId: EntityIdUtil.validate(userId, 'userId'),
    };
  }

  /**
   * Convert relationship id field (parent, folder, etc.) from various input types.
   * Handles: string ids, null (remove relationship), empty objects, invalid data.
   */
  static async convertRelationshipField(
    value: unknown,
    fieldName: string,
  ): Promise<string | null> {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'string') {
      return await Promise.resolve(EntityIdUtil.validate(value, fieldName));
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      Object.keys(value).length === 0
    ) {
      return null;
    }

    if (typeof value === 'object' && value !== null) {
      throw new ValidationException(
        `Invalid ${fieldName} format. Must be a valid entity id string or null`,
      );
    }

    throw new ValidationException(
      `Invalid ${fieldName} type. Expected string, null, or undefined, got ${typeof value}`,
    );
  }
}
