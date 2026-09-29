/**
 * Generate a consistent room name for a user's websocket connection.
 * Used across cloud and self-hosted to route events to the correct client.
 */
export function getUserRoomName(userId: string): string {
  return `user:${userId}`;
}

/**
 * Room holding only the sockets of one user that authenticated for one
 * organization. A user in several organizations holds a socket per
 * organization, so routing a thread's events here keeps them inside the
 * organization that owns the thread.
 */
export function getOrganizationUserRoomName(
  organizationId: string,
  userId: string,
): string {
  return `org:${organizationId}:user:${userId}`;
}
