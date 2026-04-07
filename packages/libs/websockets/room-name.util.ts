/**
 * Generate a consistent room name for a user's websocket connection.
 * Used across cloud and self-hosted to route events to the correct client.
 */
export function getUserRoomName(userId: string): string {
  return `user:${userId}`;
}
