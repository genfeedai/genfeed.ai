/**
 * Better Auth integration types (epic #735, Phase 1 — #736).
 */
import type { PrismaClient } from '@genfeedai/prisma';

/** OAuth credentials for first-party social sign-in providers. */
export interface IBetterAuthSocialProviderConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Custom claims embedded in the Better Auth JWT by the jwt plugin's
 * `definePayload`. `sub` (set by `getSubject`, default `user.id`) is the genfeed
 * `User.id` directly — Better Auth's `user` model maps onto the existing `User`
 * table, so there is no legacy auth-provider-style id indirection.
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
 * of `IAuthPublicMetadata` that `RequestContextMiddleware` reads. The
 * compatibility `isSuperAdmin` boolean is derived from the persisted platform
 * role; subscription tier / status are filled by the middleware from the DB.
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
  metadata?: Record<string, unknown>;
  url: string;
  token: string;
}

/** Arguments handed to Better Auth's email-verification delivery callback. */
export interface IBetterAuthVerificationEmailParams {
  token: string;
  url: string;
  user: {
    email: string;
  };
}

/**
 * Minimal shared KV (Redis) used to back Better Auth's rate-limit counters
 * across stateless API instances. Implementations must fail open — a Redis
 * outage must degrade rate limiting, never break authentication. The factory
 * adapts this into Better Auth's `rateLimit.customStorage` shape.
 */
export interface IBetterAuthRateLimitStore {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlSeconds: number) => Promise<void>;
}

/** Payload emitted after Better Auth creates a new user row. */
export interface IBetterAuthUserCreatedEvent {
  userId: string;
  email: string | null;
}

/** Options for {@link createBetterAuthInstance}. */
export interface ICreateBetterAuthOptions {
  prisma: PrismaClient;
  apiKey?: string;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  google?: IBetterAuthSocialProviderConfig;
  github?: IBetterAuthSocialProviderConfig;
  requireEmailVerification?: boolean;
  /**
   * Root cookie domain (e.g. `.genfeed.ai`) for sharing the session cookie set
   * on the API host with sibling frontend subdomains. When set, enables
   * `advanced.crossSubDomainCookies`. Unset (single-host / Community) keeps the
   * default host-scoped cookie.
   */
  cookieDomain?: string;
  /**
   * Ordered client-IP headers for Better Auth's rate limiting + session
   * tracking (e.g. `['x-forwarded-for']` behind the production ALB). Unset
   * keeps Better Auth's default header detection — important for deployment
   * modes with a different (or no) edge proxy.
   */
  ipAddressHeaders?: string[];
  /**
   * Enable Better Auth's experimental single-query joins on the Prisma adapter.
   * Gated off by default; flip per environment after staging verification.
   */
  experimentalJoins?: boolean;
  /**
   * Shared KV (Redis) backing rate-limit counters across instances. When
   * provided, rate limiting uses it instead of per-process memory.
   */
  rateLimitStore?: IBetterAuthRateLimitStore;
  sendMagicLink: (params: IBetterAuthMagicLinkParams) => Promise<void>;
  sendVerificationEmail: (
    params: IBetterAuthVerificationEmailParams,
  ) => Promise<void>;
  /**
   * Invoked (and awaited) from the `user.create.after` hook so a newly created
   * user is provisioned — org / settings / brand / member / credits — before the
   * create completes. Replaces the legacy auth provider `user.created` webhook (epic #735,
   * Phase 4).
   */
  onUserCreated?: (event: IBetterAuthUserCreatedEvent) => Promise<void>;
}
