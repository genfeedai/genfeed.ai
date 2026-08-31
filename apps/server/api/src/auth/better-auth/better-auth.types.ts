/**
 * Better Auth integration types (epic #735, Phase 1 — #736).
 */
import type { PrismaClient } from '@genfeedai/prisma';
import type { RateLimit } from 'better-auth';

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

/** Exact Better Auth session cookie installed by the desktop shell. */
export interface IDesktopSessionCookie {
  cookieName: string;
  cookieValue: string;
  expiresAt: string;
  httpOnly: boolean;
  path: string;
  sameSite: 'lax' | 'none' | 'strict';
  secure: boolean;
}

/** Server-only issuance result; the raw token exists solely for compensation. */
export interface IDesktopSessionCookieResult {
  cookie: IDesktopSessionCookie;
  token: string;
}

/**
 * Genfeed identity resolved from a verified Better Auth JWT. Shaped onto
 * `AuthenticatedUser` (`userId`, `organizationId`, `brandId`, `isSuperAdmin`)
 * for `RequestContextMiddleware` and downstream guards. `isSuperAdmin` is
 * derived from the persisted platform role; subscription tier / status are
 * filled by the middleware from the DB.
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

/** Arguments handed to Better Auth's password-reset delivery callback. */
export interface IBetterAuthResetPasswordParams {
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

/** The two Redis commands the rate-limit store issues, as ioredis spells them. */
export interface IBetterAuthRateLimitRedisCommands {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(
    key: string,
    value: string,
    expiryMode: 'EX',
    ttlSeconds: number,
  ): Promise<unknown>;
}

/**
 * Better Auth's `rateLimit.customStorage` contract, adapted from
 * {@link IBetterAuthRateLimitStore} by `buildRateLimitStorage`. Counters are the
 * library's own `RateLimit` records — the JSON round trip and the fail-open
 * guards stay inside the adapter, so consumers only ever see a parsed counter
 * or `null`.
 */
export interface IBetterAuthRateLimitStorage {
  get: (key: string) => Promise<RateLimit | null>;
  set: (key: string, value: RateLimit) => Promise<void>;
}

/** Which Redis command the rate-limit store was running when it degraded. */
export type BetterAuthRateLimitOperation = 'get' | 'set';

/** Why a rate-limit operation failed open instead of consulting Redis. */
export type BetterAuthRateLimitDegradationReason =
  /** The client reported `isReady === false`, so no command was issued. */
  | 'client-unavailable'
  /** A command was issued and threw. */
  | 'command-failed';

/** Emitted (throttled) whenever the store fails open instead of enforcing. */
export interface IBetterAuthRateLimitDegradedEvent {
  operation: BetterAuthRateLimitOperation;
  reason: BetterAuthRateLimitDegradationReason;
  /** The thrown value. Present only for `command-failed`. */
  error?: unknown;
  /** Degraded operations swallowed by the throttle since the previous event. */
  suppressedCount: number;
}

/** Emitted once when a Redis command succeeds after a reported outage. */
export interface IBetterAuthRateLimitRecoveredEvent {
  operation: BetterAuthRateLimitOperation;
  /** Total operations that failed open during the outage that just ended. */
  degradedCount: number;
}

/** Observability options for `buildRedisRateLimitStore`. */
export interface IBuildRedisRateLimitStoreOptions {
  /**
   * Minimum gap between two emitted {@link IBetterAuthRateLimitDegradedEvent}s.
   * A sustained outage degrades every single auth request, so the raw signal is
   * as hot as the auth path itself; it is collapsed into one event per window
   * carrying `suppressedCount` instead. Defaults to one minute.
   */
  degradationSignalIntervalMs?: number;
  /**
   * Shortest gap the throttle may be wound back to when the store recovers.
   * Recovery re-arms the window so a new outage is not silenced by the previous
   * one, and this floor stops a flapping client from turning that re-arm into
   * an unthrottled signal per failed operation. Defaults to five seconds, and
   * is clamped to {@link degradationSignalIntervalMs}.
   */
  recoveryRearmFloorMs?: number;
  onDegraded?: (event: IBetterAuthRateLimitDegradedEvent) => void;
  onRecovered?: (event: IBetterAuthRateLimitRecoveredEvent) => void;
}

/**
 * Structural view of {@link RateLimitClientService} used by the rate-limit store
 * adapter. Narrowed to `isReady` + the two commands so the fail-open behavior is
 * testable without standing up a real ioredis connection.
 */
export interface IBetterAuthRateLimitRedisClient {
  readonly isReady: boolean;
  readonly instance: IBetterAuthRateLimitRedisCommands;
}

/** Payload emitted after Better Auth creates a new user row. */
export interface IBetterAuthUserCreatedEvent {
  userId: string;
  email: string | null;
}

/**
 * Env values Better Auth reads through ConfigService. Cookie domain is env-only
 * — callers must not derive it from `BETTER_AUTH_URL` or the request hostname.
 */
export interface IBetterAuthEnvValues {
  BETTER_AUTH_API_KEY?: string;
  BETTER_AUTH_COOKIE_DOMAIN?: string;
  BETTER_AUTH_EXPERIMENTAL_JOINS?: string;
  BETTER_AUTH_IP_HEADERS?: string;
  BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  NODE_ENV?: string;
  PORT?: number | string;
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
  sendResetPassword: (params: IBetterAuthResetPasswordParams) => Promise<void>;
  /**
   * Invoked (and awaited) from the `user.create.after` hook so a newly created
   * user is provisioned — org / settings / brand / member / credits — before the
   * create completes. Replaces the legacy auth provider `user.created` webhook (epic #735,
   * Phase 4).
   */
  onUserCreated?: (event: IBetterAuthUserCreatedEvent) => Promise<void>;
}

/** Config-derived Better Auth instance options (secrets, origins, providers). */
export type IBetterAuthRuntimeConfig = Pick<
  ICreateBetterAuthOptions,
  | 'apiKey'
  | 'baseURL'
  | 'cookieDomain'
  | 'experimentalJoins'
  | 'github'
  | 'google'
  | 'ipAddressHeaders'
  | 'requireEmailVerification'
  | 'secret'
  | 'trustedOrigins'
>;
