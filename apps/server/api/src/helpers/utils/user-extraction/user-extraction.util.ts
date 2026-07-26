import { getUserRoomName } from '@libs/websockets/room-name.util';

/**
 * User document structure from populated user references
 */
export interface PopulatedUserDoc {
  _id?: string;
  id?: string;
}

/**
 * Extracted user IDs from a document
 */
export interface ExtractedUserIds {
  /** Database user ID as string */
  dbUserId?: string;
  /** Compatibility queue field, now carrying the canonical database user ID. */
  authProviderUserId?: string;
  /** Canonical user ID */
  userId?: string;
  /** WebSocket room identifier */
  userRoom?: string;
}

/**
 * Utility for extracting user IDs from populated or unpopulated user references.
 * Consolidates canonical user ID extraction from ingredient.user, asset.user,
 * and similar populated references.
 */
export class UserExtractionUtil {
  /**
   * Extract user IDs from a user reference field.
   * Handles multiple formats:
   * - Populated user document with id or _id
   * - String user ID
   * - Types.ObjectId
   *
   * @param userField The user field from a document (can be populated or unpopulated)
   * @returns ExtractedUserIds with all available user identifiers
   */
  static extractUserIds(
    userField:
      | PopulatedUserDoc
      | { _id?: string; id?: string }
      | string
      | null
      | undefined,
  ): ExtractedUserIds {
    if (!userField) {
      return {};
    }

    let dbUserId: string | undefined;
    // Handle string user ID
    if (typeof userField === 'string') {
      dbUserId = userField;
    }
    // Handle populated user document
    else if (typeof userField === 'object' && userField !== null) {
      const userDoc = userField as PopulatedUserDoc;

      // Extract _id
      if (typeof userDoc.id === 'string') {
        dbUserId = userDoc.id;
      } else if (typeof userDoc._id === 'string') {
        dbUserId = userDoc._id;
      }
    }

    const authProviderUserId = dbUserId;
    const userId = dbUserId;
    const userRoom = userId ? getUserRoomName(userId) : undefined;

    return {
      authProviderUserId,
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
    brandField: { id?: string } | string | null | undefined,
  ): string | undefined {
    if (!brandField) {
      return undefined;
    }

    if (typeof brandField === 'string') {
      return brandField;
    }

    if (typeof brandField === 'object' && brandField !== null) {
      const brandDoc = brandField as { id?: string };
      if (typeof brandDoc.id === 'string') {
        return brandDoc.id;
      }
    }

    return undefined;
  }
}
