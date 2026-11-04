import type { PlatformRole } from '../..';

export interface IBetterAuthJwksVerifierOptions {
  audience: string;
  issuer: string;
  jwksUrl: string;
}

export interface IBetterAuthJwtUserPayloadSource {
  id?: string;
  email?: string | null;
  name?: string | null;
  platformRole?: PlatformRole | null;
}

export interface IBetterAuthVerifiedClaims {
  /** Subject - the Prisma `User.id` (the jwt plugin sets `sub = user.id`). */
  sub: string;
  /** Active organization id signed by the API for DB-less websocket authz. */
  organizationId?: string;
  /**
   * True only when the signed `isSuperAdmin` claim is literally `true`. The API
   * derives it from `users.platformRole` when it mints the JWT, so DB-less
   * consumers can gate platform-administrator surfaces on it.
   */
  isSuperAdmin: boolean;
}
