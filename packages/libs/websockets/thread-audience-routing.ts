import { getOrganizationUserRoomName, getUserRoomName } from './room-name.util';

/**
 * How long a member whose thread access was revoked stays filtered out of that
 * thread's events (#9938). An API process may still hold an audience resolved
 * before the revoke for a few seconds; this covers that window so the member's
 * socket gets nothing further.
 */
const ACCESS_REVOKED_DENY_MS = 10_000;

/**
 * Rooms for members of one organization. Each holds only the sockets that
 * authenticated for that organization, so a thread's events never reach a
 * member's socket for another one. Self-hosted is single-tenant, so a user's
 * own room cannot cross a tenant boundary; it also reaches a socket whose
 * token carries no organization.
 */
export function getMemberRoomNames(
  organizationId: string,
  userIds: readonly string[],
  isSingleTenant: boolean,
): string[] {
  return userIds.flatMap((userId) =>
    isSingleTenant
      ? [
          getOrganizationUserRoomName(organizationId, userId),
          getUserRoomName(userId),
        ]
      : [getOrganizationUserRoomName(organizationId, userId)],
  );
}

/** Members whose access to one thread was just revoked. */
export class ThreadAccessDenials {
  /** `org:thread:user` -> when the denial ends. */
  private readonly until = new Map<string, number>();

  private key(organizationId: string, threadId: string, userId: string) {
    return `${organizationId}:${threadId}:${userId}`;
  }

  deny(organizationId: string, threadId: string, userId: string): void {
    this.until.set(
      this.key(organizationId, threadId, userId),
      Date.now() + ACCESS_REVOKED_DENY_MS,
    );
  }

  /** The audience minus members whose access to this thread was just revoked. */
  filter(
    organizationId: string,
    threadId: string,
    userIds: readonly string[],
  ): string[] {
    const now = Date.now();
    for (const [key, until] of this.until) {
      if (until <= now) {
        this.until.delete(key);
      }
    }
    return userIds.filter(
      (userId) => !this.until.has(this.key(organizationId, threadId, userId)),
    );
  }
}
