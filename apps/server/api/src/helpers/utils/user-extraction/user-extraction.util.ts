import { getUserRoomName } from '@libs/websockets/room-name.util';

/**
 * User document structure from populated user references
 */
export interface PopulatedUserDoc {
  id?: string;
}

/**
 * Extracted user IDs from a document
 */
export interface ExtractedUserIds {
  /** Database user ID as string */
  dbUserId?: string;
  /** Canonical user ID */
  userId?: string;
  /** WebSocket room identifier */
  userRoom?: string;
}

type CanonicalReference = { id?: string } | string | null | undefined;

function extractCanonicalId(reference: CanonicalReference): string | undefined {
  if (typeof reference === 'string') {
    return reference || undefined;
  }

  if (typeof reference?.id === 'string') {
    return reference.id || undefined;
  }

  return undefined;
}

/** Extract canonical IDs and websocket routing data from a user reference. */
export function extractUserIds(
  userField: PopulatedUserDoc | string | null | undefined,
): ExtractedUserIds {
  const dbUserId = extractCanonicalId(userField);
  if (!dbUserId) {
    return {};
  }

  return {
    dbUserId,
    userId: dbUserId,
    userRoom: getUserRoomName(dbUserId),
  };
}
