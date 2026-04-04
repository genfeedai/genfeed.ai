import { Types } from 'mongoose';

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

    return Types.ObjectId.isValid(id) && id.length === 24;
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
   * Creates a new ObjectId from a string, with validation
   * @param id - The string to convert
   * @returns ObjectId instance
   * @throws Error if invalid ObjectId string
   */
  static createObjectId(id: string): Types.ObjectId {
    if (!ObjectIdValidator.isValid(id)) {
      throw new Error(`Invalid ObjectId: ${id}`);
    }

    return new Types.ObjectId(id);
  }

  /**
   * Safely creates an ObjectId, returning null if invalid
   * @param id - The string to convert
   * @returns ObjectId instance or null if invalid
   */
  static safeCreateObjectId(id: string): Types.ObjectId | null {
    try {
      return ObjectIdValidator.createObjectId(id);
    } catch {
      return null;
    }
  }
}
