import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { UsersService } from '@api/collections/users/services/users.service';
import { UnauthorizedException } from '@nestjs/common';

export function resolveAgentThreadOrganizationId(user: User): string {
  const organization = user.organizationId;
  if (!organization) {
    throw new UnauthorizedException(
      'Invalid organization context. Please sign in again.',
    );
  }
  return organization;
}

/**
 * Resolve the internal (cuid) User.id that AgentThread.userId is a foreign
 * key to. This must trust the already-authenticated identity the same way
 * every other working endpoint does (see UsersController): read
 * `(user.userId ?? user.id)` directly, with no DB re-lookup. That value
 * is populated once per request by the registered Better Auth identity
 * resolver and is exactly the id AgentThread.userId expects.
 *
 * The DB lookup below is retained only as a last-resort fallback for the
 * rare case where identity carries no user id at all. It resolves
 * `user.id` as the canonical primary key; an unresolved subject fails with
 * 401 rather than being reinterpreted as an external identifier.
 */
export async function resolveAgentThreadDatabaseUserId(
  user: User,
  usersService: Pick<UsersService, 'findOne'>,
): Promise<string> {
  const metadataUserId = user.userId ?? user.id;
  if (metadataUserId) {
    return metadataUserId;
  }

  const userId = user.id;
  if (!userId) {
    throw new UnauthorizedException(
      'Missing user identity. Please sign in again.',
    );
  }

  const dbUser = await usersService.findOne({ id: userId }, []);
  const fallbackUserId = dbUser?.id;
  if (!fallbackUserId) {
    throw new UnauthorizedException('User account not found');
  }

  return String(fallbackUserId);
}
