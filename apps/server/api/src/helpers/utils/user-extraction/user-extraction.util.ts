import { getUserRoomName } from '@libs/websockets/room-name.util';

/**
 * User document structure from populated user references
 */
export interface PopulatedUserDoc {
  _id?: string;
  authProviderId?: string | null;
}

/**
 * Extracted user IDs from a document
 */
export interface ExtractedUserIds {
  /** Database user ID as string */
  dbUserId?: string;
  /** legacy auth provider user ID */
  authProviderUserId?: string;
  /** Preferred user ID (authProviderUserId if available, else dbUserId) */
  userId?: string;
  /** WebSocket room identifier */
  userRoom?: string;
}

/**
 * Utility for extracting user IDs from populated or unpopulated user references.
 * Consolidates the repeated pattern of extracting dbUserId and authProviderUserId
 * from ingredient.user, asset.user, etc.
 */
export class UserExtractionUtil {
  /**
   * Extract user IDs from a user reference field.
   * Handles multiple formats:
   * - Populated user document with _id and authProviderId
   * - String user ID
   * - Types.ObjectId
   *
   * @param userField The user field from a document (can be populated or unpopulated)
   * @returns ExtractedUserIds with all available user identifiers
   */
  static extractUserIds(
    userField:
      | PopulatedUserDoc
      | { _id?: string; authProviderId?: string | null }
      | string
      | null
      | undefined,
  ): ExtractedUserIds {
    if (!userField) {
      return {};
    }

    let dbUserId: string | undefined;
    let authProviderUserId: string | undefined;

    // Handle string user ID
    if (typeof userField === 'string') {
      dbUserId = userField;
    }
    // Handle populated user document
    else if (typeof userField === 'object' && userField !== null) {
      const userDoc = userField as PopulatedUserDoc;

      // Extract _id
      if (typeof userDoc._id === 'string') {
        dbUserId = userDoc._id;
      }

      // Extract authProviderId
      authProviderUserId = userDoc.authProviderId ?? undefined;
    }

    const userId = authProviderUserId || dbUserId;
    const userRoom = authProviderUserId
      ? getUserRoomName(authProviderUserId)
      : undefined;

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
    brandField: { _id?: string } | string | null | undefined,
  ): string | undefined {
    if (!brandField) {
      return undefined;
    }

    if (typeof brandField === 'string') {
      return brandField;
    }

    if (typeof brandField === 'object' && brandField !== null) {
      const brandDoc = brandField as { _id?: string };
      if (typeof brandDoc._id === 'string') {
        return brandDoc._id;
      }
    }

    return undefined;
  }
}
