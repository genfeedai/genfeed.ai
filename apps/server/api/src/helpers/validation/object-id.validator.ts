import { isEntityId } from '@api/helpers/validation/entity-id.validator';

export class ObjectIdValidator {
  /**
   * Validates if a string is a supported entity id.
   * @param id - The string to validate
   * @returns true if valid, false otherwise
   */
  static isValid(id: unknown): boolean {
    return isEntityId(id);
  }

  /**
   * Validates an array of entity id strings.
   * @param ids - Array of strings to validate
   * @returns true if all are valid ids, false otherwise
   */
  static areAllValid(ids: string[]): boolean {
    if (!Array.isArray(ids) || ids.length === 0) {
      return false;
    }

    return ids.every((id) => ObjectIdValidator.isValid(id));
  }

  /**
   * Returns the id string if valid, throws if invalid.
   * @param id - The string to validate
   * @returns The id string
   * @throws Error if invalid id string
   */
  static createObjectId(id: string): string {
    if (!ObjectIdValidator.isValid(id)) {
      throw new Error(`Invalid entity id: ${id}`);
    }

    return id;
  }

  /**
   * Safely validates an id string, returning null if invalid.
   * @param id - The string to validate
   * @returns The id string or null if invalid
   */
  static safeCreateObjectId(id: string): string | null {
    try {
      return ObjectIdValidator.createObjectId(id);
    } catch {
      return null;
    }
  }
}
