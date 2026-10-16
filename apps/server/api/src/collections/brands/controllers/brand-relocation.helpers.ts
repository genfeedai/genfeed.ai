import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandRelocationActingUser } from '@api/collections/brands/services/brand-relocation.service';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import type { Request } from 'express';

/**
 * Who is moving the brand, as the request authenticated them. An API key
 * carries its own scopes: it relocates only with an explicit admin scope, which
 * the relocation service enforces.
 */
export function toRelocationActor(
  user: User,
  request: Request,
): BrandRelocationActingUser {
  return {
    isApiKey: user.isApiKey,
    isSuperAdmin: getIsSuperAdmin(user, request),
    scopes: user.scopes,
    userId: user.userId ?? user.id,
  };
}
