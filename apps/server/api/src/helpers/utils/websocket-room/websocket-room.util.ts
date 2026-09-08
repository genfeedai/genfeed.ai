import { getUserRoomName } from '@libs/websockets/room-name.util';

/** Validates that a room can be determined from the canonical user ID. */
export function validateRoomMatch(userId?: string): {
  isValid: boolean;
  warning?: string;
} {
  if (userId) {
    return { isValid: true };
  }

  return {
    isValid: false,
    warning: 'No user ID available for WebSocket room',
  };
}

/**
 * Resolves the effective room for WebSocket publishing.
 * Uses userRoom if available, falls back to userId-based room.
 */
export function resolveRoom(
  userRoom?: string,
  userId?: string,
): string | undefined {
  return userRoom || (userId ? getUserRoomName(userId) : undefined);
}
