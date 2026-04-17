const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;

export class ObjectIdValidator {
  /**
   * Validates if a string is a valid MongoDB ObjectId
   * @param id - The string to validate
   * @returns true if valid ObjectId, false otherwise
   */
  static isValid(id: string): boolean {
    if (!id || typeof id !== 'string') {
      return false;
    }

    return OBJECT_ID_REGEX.test(id);
  }

  /**
   * Validates an array of ObjectId strings
   * @param ids - Array of strings to validate
   * @returns true if all are valid ObjectIds, false otherwise
   */
  static areAllValid(ids: string[]): boolean {
    if (!Array.isArray(ids) || ids.length === 0) {
      return false;
    }

    return ids.every((id) => ObjectIdValidator.isValid(id));
  }

  /**
   * Returns the id string if valid, throws if invalid.
   * Prisma uses string IDs — no ObjectId conversion needed.
   * @param id - The string to validate
   * @returns The id string
   * @throws Error if invalid ObjectId string
   */
  static createObjectId(id: string): string {
    if (!ObjectIdValidator.isValid(id)) {
      throw new Error(`Invalid ObjectId: ${id}`);
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
