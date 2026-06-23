/**
 * Better Auth integration types (epic #735, Phase 1 — #736).
 */
import type { PrismaClient } from '@genfeedai/prisma';

/** Google OAuth credentials for the day-one social sign-in. */
export interface IBetterAuthGoogleConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Custom claims embedded in the Better Auth JWT by the jwt plugin's
 * `definePayload`. `sub` (set by `getSubject`, default `user.id`) is the genfeed
 * `User.id` directly — Better Auth's `user` model maps onto the existing `User`
 * table, so there is no Clerk-style id indirection.
 */
export interface IBetterAuthJwtClaims {
  sub: string;
  email?: string;
  name?: string;
  organizationId?: string;
  isSuperAdmin?: boolean;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
}

/**
 * Genfeed identity resolved from a verified Better Auth JWT. Mirrors the subset
 * of `IClerkPublicMetadata` that `RequestContextMiddleware` reads; subscription
 * tier / status are filled by the middleware from the DB, so they are not
 * resolved here.
 */
export interface IBetterAuthResolvedIdentity {
  userId: string;
  organizationId?: string;
  brandId?: string;
  isSuperAdmin: boolean;
}

/** Arguments handed to the magic-link delivery callback. */
export interface IBetterAuthMagicLinkParams {
  email: string;
  url: string;
  token: string;
}

/** Payload emitted after Better Auth creates a new user row. */
export interface IBetterAuthUserCreatedEvent {
  userId: string;
  email: string | null;
}

/** Options for {@link createBetterAuthInstance}. */
export interface ICreateBetterAuthOptions {
  prisma: PrismaClient;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  google?: IBetterAuthGoogleConfig;
  sendMagicLink: (params: IBetterAuthMagicLinkParams) => Promise<void>;
  /**
   * Invoked (and awaited) from the `user.create.after` hook so a newly created
   * user is provisioned — org / settings / brand / member / credits — before the
   * create completes. Replaces the Clerk `user.created` webhook (epic #735,
   * Phase 4).
   */
  onUserCreated?: (event: IBetterAuthUserCreatedEvent) => Promise<void>;
}
