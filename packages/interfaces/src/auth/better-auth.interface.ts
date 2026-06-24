export interface IBetterAuthJwksVerifierOptions {
  audience: string;
  issuer: string;
  jwksUrl: string;
}

export interface IBetterAuthJwtUserPayloadSource {
  id?: string;
  email?: string | null;
  name?: string | null;
  platformRole?: string | null;
}

export interface IBetterAuthVerifiedClaims {
  /** Subject - the Prisma `User.id` (the jwt plugin sets `sub = user.id`). */
  sub: string;
  /** Active organization id signed by the API for DB-less websocket authz. */
  organizationId?: string;
}
