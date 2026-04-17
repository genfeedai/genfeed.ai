import { getUserRoomName } from '@libs/websockets/room-name.util';

/**
 * User document structure from populated user references
 */
export interface PopulatedUserDoc {
  _id?: string;
  clerkId?: string;
}

/**
 * Extracted user IDs from a document
 */
export interface ExtractedUserIds {
  /** Database user ID as string */
  dbUserId?: string;
  /** Clerk user ID */
  clerkUserId?: string;
  /** Preferred user ID (clerkUserId if available, else dbUserId) */
  userId?: string;
  /** WebSocket room identifier */
  userRoom?: string;
}

/**
 * Utility for extracting user IDs from populated or unpopulated user references.
 * Consolidates the repeated pattern of extracting dbUserId and clerkUserId
 * from ingredient.user, asset.user, etc.
 */
export class UserExtractionUtil {
  /**
   * Extract user IDs from a user reference field.
   * Handles multiple formats:
   * - Populated user document with _id and clerkId
   * - String user ID
   * - Types.ObjectId
   *
   * @param userField The user field from a document (can be populated or unpopulated)
   * @returns ExtractedUserIds with all available user identifiers
   */
  static extractUserIds(
    userField: PopulatedUserDoc | string | undefined,
  ): ExtractedUserIds {
    if (!userField) {
      return {};
    }

    let dbUserId: string | undefined;
    let clerkUserId: string | undefined;

    // Handle string user ID
    if (typeof userField === 'string') {
      dbUserId = userField;
    }
    // Handle Types.ObjectId
    else if (userField instanceof Types.ObjectId) {
      dbUserId = userField.toHexString();
    }
    // Handle populated user document
    else if (typeof userField === 'object' && userField !== null) {
      const userDoc = userField as PopulatedUserDoc;

      // Extract _id
      if (userDoc._id instanceof Types.ObjectId) {
        dbUserId = userDoc._id.toHexString();
      } else if (typeof userDoc._id === 'string') {
        dbUserId = userDoc._id;
      }

      // Extract clerkId
      clerkUserId = userDoc.clerkId;
    }

    const userId = clerkUserId || dbUserId;
    const userRoom = clerkUserId ? getUserRoomName(clerkUserId) : undefined;

    return {
      clerkUserId,
      dbUserId,
      userId,
      userRoom,
    };
  }

  /**
   * Extract brand ID from a brand reference field.
   * Handles populated and unpopulated references.
   */
  static extractBrandId(
    brandField: { _id?: string } | string | Types.ObjectId | undefined,
  ): string | undefined {
    if (!brandField) {
      return undefined;
    }

    if (typeof brandField === 'string') {
      return brandField;
    }

    if (brandField instanceof Types.ObjectId) {
      return brandField.toHexString();
    }

    if (typeof brandField === 'object' && brandField !== null) {
      const brandDoc = brandField as { _id?: string };
      if (brandDoc._id instanceof Types.ObjectId) {
        return brandDoc._id.toHexString();
      }
      if (typeof brandDoc._id === 'string') {
        return brandDoc._id;
      }
    }

    return undefined;
  }
}
