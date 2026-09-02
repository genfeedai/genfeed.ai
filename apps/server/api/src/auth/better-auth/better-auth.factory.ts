import { randomUUID } from 'node:crypto';
import { type DashOptions, dash } from '@better-auth/infra';
import { PlatformRole } from '@genfeedai/contracts';
import type { IBetterAuthJwtUserPayloadSource } from '@genfeedai/contracts/interfaces';
import {
  APIError,
  type BetterAuthOptions,
  betterAuth,
  type RateLimit,
} from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import {
  type AdminOptions,
  admin,
  jwt,
  type MagicLinkOptions,
  magicLink,
  type OrganizationOptions,
  organization,
} from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import type {
  IBetterAuthRateLimitStorage,
  IBetterAuthRateLimitStore,
  ICreateBetterAuthOptions,
} from './better-auth.types';
import { isPlatformSuperAdmin } from './better-auth-access.util';
import { desktopSession } from './plugins/desktop-session.plugin';

/**
 * Prefix + GC window for Better Auth rate-limit counters in Redis. Active keys
 * refresh their TTL on each write, so the TTL only reclaims idle counters.
 */
const RATE_LIMIT_KEY_PREFIX = 'ba:ratelimit:';
/** Exported so integration tests assert the real production TTL is forwarded. */
export const RATE_LIMIT_TTL_SECONDS = 86_400;
const BETTER_AUTH_CREATOR_ROLE = 'admin';
const BETTER_AUTH_DEFAULT_ORGANIZATION_CATEGORY = 'BUSINESS';
const BETTER_AUTH_MAGIC_LINK_EXPIRES_IN_SECONDS = 300;
const SIGN_UP_MAGIC_LINK_INTENT = 'signup';

type BetterAuthDatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>;
type BetterAuthMagicLinkDependencies = Pick<
  ICreateBetterAuthOptions,
  'prisma' | 'sendMagicLink'
> & {
  storeToken?: MagicLinkOptions['storeToken'];
};
type BetterAuthDashOptions = DashOptions & {
  activityTracking: { enabled: true };
  apiKey: string;
};
type BetterAuthUserBeforePayload = {
  email?: string | null;
  handle?: string;
  name?: string | null;
};
type BetterAuthUserAfterPayload = {
  email?: string | null;
  id: string;
};

export const SIGN_UP_MAGIC_LINK_EXISTING_USER_MESSAGE =
  'An account already exists for this email. Sign in instead.';

/** Enable Better Auth dashboard activity tracking when dashboard auth exists. */
export function buildBetterAuthDashOptions(
  apiKey: string,
): BetterAuthDashOptions {
  return {
    activityTracking: { enabled: true },
    apiKey,
  };
}

/**
 * Keep Dash's plugin-owned activity timestamp out of public user inputs.
 *
 * Infra 0.4.0 omits `input: false`, and Better Auth merges plugin fields after
 * `user.additionalFields`, so the protection must live on the returned plugin
 * schema rather than in the app-level user field configuration.
 */
export function buildBetterAuthDashPlugin(apiKey: string) {
  const plugin = dash(buildBetterAuthDashOptions(apiKey));

  return {
    ...plugin,
    schema: {
      ...plugin.schema,
      user: {
        ...plugin.schema.user,
        fields: {
          ...plugin.schema.user.fields,
          lastActiveAt: {
            ...plugin.schema.user.fields.lastActiveAt,
            input: false as const,
          },
        },
      },
    },
  };
}

/**
 * Build the deployment-sensitive Better Auth options in one testable boundary.
 *
 * Community/self-hosted deployments keep the default host-scoped cookie when
 * `cookieDomain` is absent. Cloud can explicitly share the session cookie
 * across sibling subdomains, while proxy-specific IP headers remain optional
 * for deployments without that edge topology.
 */
export function buildBetterAuthAdvancedOptions({
  cookieDomain,
  ipAddressHeaders,
}: Pick<
  ICreateBetterAuthOptions,
  'cookieDomain' | 'ipAddressHeaders'
>): NonNullable<BetterAuthOptions['advanced']> {
  return {
    // Keep auth-owned records inside Genfeed's canonical entity-ID contract.
    // Better Auth otherwise injects mixed-case base62 IDs that the API's entity
    // boundaries do not recognize; UUID generation works across every adapter.
    database: { generateId: 'uuid' },
    ...(ipAddressHeaders && ipAddressHeaders.length > 0
      ? { ipAddress: { ipAddressHeaders } }
      : {}),
    ...(cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
      : {}),
  };
}

/**
 * A parsed counter is only usable if both numeric fields survived the round
 * trip. Better Auth's `decideConsume` does raw arithmetic on them
 * (`now - lastRequest > windowMs`, `count >= max`), and `undefined`/string
 * operands poison that arithmetic with `NaN` in both directions: the
 * window-expiry reset can never fire (permanent 429 for the key's whole TTL),
 * or `count` becomes `NaN` and never reaches `max` (throttling silently off).
 */
function isStoredRateLimit(value: unknown): value is RateLimit {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Record<keyof RateLimit, unknown>>;
  return (
    Number.isFinite(candidate.count) && Number.isFinite(candidate.lastRequest)
  );
}

/**
 * Adapt the shared Redis KV into Better Auth's `rateLimit.customStorage` shape
 * so all API instances share one counter window (per-process memory would let
 * the effective limit scale with instance count). Reads/writes are JSON.
 *
 * This layer fails open independently of the injected store (#738, criterion 7).
 * `buildRedisRateLimitStore` already swallows Redis errors, but Better Auth
 * awaits `customStorage` directly on the `/auth/*` hot path, so *any* rejection
 * here — a corrupt value, a foreign store implementation, a serialization
 * failure — would surface as a 500 on sign-in. An unavailable counter must cost
 * rate limiting, never authentication.
 */
export function buildRateLimitStorage(
  store: IBetterAuthRateLimitStore,
): IBetterAuthRateLimitStorage {
  return {
    get: async (key) => {
      let raw: string | null;
      try {
        raw = await store.get(`${RATE_LIMIT_KEY_PREFIX}${key}`);
      } catch {
        return null;
      }
      if (!raw) {
        return null;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Corrupt or foreign value at this key (e.g. another app sharing the
        // Redis instance). Fail open — treat it as no existing window rather
        // than letting a SyntaxError surface from the rate limiter as a 500.
        return null;
      }
      // Parseable but not a counter — same threat, one step further in. Discard
      // it so the next write rebuilds a clean window and throttling resumes.
      return isStoredRateLimit(parsed) ? parsed : null;
    },
    set: async (key, value) => {
      try {
        await store.set(
          `${RATE_LIMIT_KEY_PREFIX}${key}`,
          JSON.stringify(value),
          RATE_LIMIT_TTL_SECONDS,
        );
      } catch {
        // Dropping the write loses the window, which lets the next request
        // through. That is the correct trade: a 500 here would block sign-in.
        return;
      }
    },
  };
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getRequiredString(value: unknown, label: string): string {
  const resolved = getString(value);
  if (!resolved) {
    throw new Error(`${label} is required for Better Auth organization bridge`);
  }
  return resolved;
}

function isSignUpMagicLink(metadata?: Record<string, unknown>): boolean {
  return metadata?.intent === SIGN_UP_MAGIC_LINK_INTENT;
}

export async function assertSignupMagicLinkCanCreateUser({
  email,
  metadata,
  prisma,
}: {
  email: string;
  metadata?: Record<string, unknown>;
  prisma: ICreateBetterAuthOptions['prisma'];
}): Promise<void> {
  if (!isSignUpMagicLink(metadata)) {
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  const existingUser = await prisma.user.findFirst({
    select: { id: true },
    where: {
      email: { equals: normalizedEmail, mode: 'insensitive' },
      isDeleted: false,
    },
  });

  if (existingUser) {
    throw APIError.from('BAD_REQUEST', {
      code: 'USER_ALREADY_EXISTS',
      message: SIGN_UP_MAGIC_LINK_EXISTING_USER_MESSAGE,
    });
  }
}

/**
 * Keep the production magic-link security contract in one reusable boundary.
 * Contract tests run these exact options against Better Auth's memory adapter,
 * while production supplies the Prisma adapter to the enclosing auth instance.
 */
export function buildBetterAuthMagicLinkOptions({
  prisma,
  sendMagicLink,
  storeToken = 'hashed',
}: BetterAuthMagicLinkDependencies): MagicLinkOptions {
  return {
    expiresIn: BETTER_AUTH_MAGIC_LINK_EXPIRES_IN_SECONDS,
    // Production persists only the hash so a DB read cannot replay the token.
    // Local development stores plaintext in `auth_tokens.identifier` so operators
    // can complete sign-in without a working mailer.
    storeToken,
    sendMagicLink: async ({ email, metadata, url, token }) => {
      await assertSignupMagicLinkCanCreateUser({
        email,
        metadata,
        prisma,
      });
      await sendMagicLink({ email, metadata, url, token });
    },
  };
}

/**
 * Maps Better Auth's organization plugin onto Genfeed's existing domain tables.
 *
 * BA gets string role/session compatibility (`roleKey`,
 * `Session.activeOrganizationId`), but Genfeed authorization keeps validating
 * against Organization/Member/Role rows. Membership mutation stays owned by
 * Genfeed: invitation creation (`InvitationService`) and member add / role
 * changes (RolesGuard-protected members API) are all rejected on the BA side so
 * there is exactly one authorized, source-of-truth path for each — and no BA
 * native endpoint can grant a Genfeed Role without going through RolesGuard.
 */
export function buildBetterAuthOrganizationOptions(
  _prisma: ICreateBetterAuthOptions['prisma'],
): OrganizationOptions {
  return {
    creatorRole: BETTER_AUTH_CREATOR_ROLE,
    disableOrganizationDeletion: true,
    requireEmailVerificationOnInvitation: true,
    schema: {
      session: {
        fields: {
          activeOrganizationId: 'activeOrganizationId',
        },
      },
      organization: {
        modelName: 'organization',
        fields: {
          createdAt: 'createdAt',
          logo: 'authProviderLogoUrl',
          name: 'label',
          slug: 'slug',
        },
        additionalFields: {
          category: {
            defaultValue: BETTER_AUTH_DEFAULT_ORGANIZATION_CATEGORY,
            input: false,
            required: true,
            type: 'string',
          },
          isDeleted: {
            defaultValue: false,
            input: false,
            required: true,
            type: 'boolean',
          },
          isSelected: {
            defaultValue: false,
            input: false,
            required: true,
            type: 'boolean',
          },
          userId: {
            input: false,
            references: { field: 'id', model: 'user' },
            required: true,
            type: 'string',
          },
        },
      },
      member: {
        modelName: 'member',
        fields: {
          createdAt: 'createdAt',
          organizationId: 'organizationId',
          role: 'roleKey',
          userId: 'userId',
        },
        additionalFields: {
          isActive: {
            defaultValue: true,
            input: false,
            required: true,
            type: 'boolean',
          },
          isDeleted: {
            defaultValue: false,
            input: false,
            required: true,
            type: 'boolean',
          },
          roleId: {
            input: false,
            references: { field: 'id', model: 'role' },
            required: true,
            type: 'string',
          },
          updatedAt: {
            input: false,
            onUpdate: () => new Date(),
            required: false,
            type: 'date',
          },
        },
      },
      invitation: {
        modelName: 'invitation',
        fields: {
          createdAt: 'createdAt',
          email: 'email',
          expiresAt: 'expiresAt',
          inviterId: 'invitedByUserId',
          organizationId: 'organizationId',
          role: 'roleKey',
          status: 'status',
        },
        additionalFields: {
          roleId: {
            input: false,
            references: { field: 'id', model: 'role' },
            required: true,
            type: 'string',
          },
          tokenHash: {
            input: false,
            required: true,
            type: 'string',
            unique: true,
          },
          updatedAt: {
            input: false,
            onUpdate: () => new Date(),
            required: false,
            type: 'date',
          },
        },
      },
    },
    organizationHooks: {
      beforeCreateOrganization: async ({ organization, user }) => {
        return {
          data: {
            ...organization,
            category: BETTER_AUTH_DEFAULT_ORGANIZATION_CATEGORY,
            isDeleted: false,
            isSelected: false,
            userId: getRequiredString(user.id, 'user.id'),
          },
        };
      },
      // Member add / role-change are NOT allowed through Better Auth's native
      // organization endpoints. Genfeed owns membership: all member writes go
      // through RolesGuard-protected controllers + InvitationService, which map
      // and authorize Genfeed Roles. If these hooks resolved a Role from the
      // BA-supplied role string, any caller holding a BA org 'admin'/'owner'
      // role could hit /organization/add-member or /update-member-role and
      // self-promote to Genfeed's admin Role, bypassing RolesGuard entirely.
      // Throw (as beforeCreateInvitation does) so there is one authorized path.
      beforeAddMember: async () => {
        throw new Error(
          'Genfeed owns organization membership; Better Auth add-member is disabled. Use the members API.',
        );
      },
      beforeUpdateMemberRole: async () => {
        throw new Error(
          'Genfeed owns organization membership; Better Auth member role changes are disabled. Use the members API.',
        );
      },
      beforeCreateInvitation: async () => {
        throw new Error(
          'Genfeed InvitationService owns organization invitations; Better Auth invite creation is disabled.',
        );
      },
    },
  };
}

/**
 * Better Auth admin plugin (#2423) gated on the existing platform role system.
 *
 * The plugin's `role` field maps onto the existing `users.platformRole` column
 * so there is exactly one role system — the same column `isPlatformSuperAdmin`
 * checks. `SUPERADMIN` carries the plugin's default admin permission set
 * (impersonation included, but not `impersonate-admins`, so superadmins cannot
 * impersonate each other), while `USER` carries no admin permission and every
 * `/admin/*` endpoint rejects it with 403.
 *
 * `defaultRole` must stay `USER` (a valid `PlatformRole` enum value): the
 * plugin's user-create hook writes it through the field mapping into the enum
 * column, and the plugin's lowercase `'user'` default would fail the Prisma
 * enum write and break first-time sign-up.
 *
 * Impersonation keeps the plugin's default 1h session expiry;
 * `Session.impersonatedBy` is the audit trail.
 */
export function buildBetterAuthAdminOptions(): AdminOptions {
  return {
    adminRoles: [PlatformRole.SUPERADMIN],
    defaultRole: PlatformRole.USER,
    roles: {
      [PlatformRole.SUPERADMIN]: adminAc,
      [PlatformRole.USER]: userAc,
    },
    schema: {
      user: {
        fields: {
          role: 'platformRole',
        },
      },
    },
  };
}

/**
 * Derive a unique, URL-safe `User.handle` for first-party sign-ups. The existing
 * `handle` column is required + unique and Better Auth does not populate it, so a
 * `user.create.before` hook fills it. The random suffix avoids collisions on the
 * unique index without a read-then-write race.
 */
function generateHandle(input: {
  email?: string | null;
  name?: string | null;
}): string {
  const base =
    (input.email?.split('@')[0] ?? input.name ?? 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'user';
  return `${base}-${randomUUID().slice(0, 8)}`;
}

/**
 * Build the first-time user hooks as a directly testable auth boundary.
 *
 * The before hook supplies the required Genfeed handle that Better Auth does
 * not own. The after hook awaits resource provisioning so callers do not
 * observe a newly created user before its canonical organization, brand,
 * membership, settings, and credits have been initialized.
 */
export function buildBetterAuthUserDatabaseHooks(
  onUserCreated?: ICreateBetterAuthOptions['onUserCreated'],
): BetterAuthDatabaseHooks {
  return {
    user: {
      create: {
        before: async (user) => {
          const typed = user as BetterAuthUserBeforePayload;
          if (typed.handle) {
            return { data: user };
          }
          return {
            data: {
              ...user,
              handle: generateHandle({
                email: typed.email,
                name: typed.name,
              }),
            },
          };
        },
        // Provision org/settings/brand/member/credits for the new user. Awaited
        // so a brand-new user is fully set up before its first request, and
        // (idempotently) a no-op for returning preserved users. Replaces the
        // legacy auth provider `user.created` webhook (epic #735, Phase 4).
        after: async (user) => {
          const typed = user as BetterAuthUserAfterPayload;
          await onUserCreated?.({
            email: typed.email ?? null,
            userId: typed.id,
          });
        },
      },
    },
  };
}

/**
 * Resolve the active organization embedded in BA JWTs for DB-less consumers
 * such as the notifications websocket process. Mirrors
 * BetterAuthIdentityResolverService's org precedence without importing Nest
 * services into the auth factory.
 */
export async function resolveBetterAuthJwtOrganizationId(
  prisma: ICreateBetterAuthOptions['prisma'],
  userId: string,
): Promise<string | undefined> {
  const user = await prisma.user.findFirst({
    select: { lastUsedOrganizationId: true },
    where: { id: userId, isDeleted: false },
  });
  if (!user) {
    return undefined;
  }

  return resolveBetterAuthJwtOrganizationIdFromLastUsed(
    prisma,
    userId,
    user?.lastUsedOrganizationId,
  );
}

async function resolveBetterAuthJwtOrganizationIdFromLastUsed(
  prisma: ICreateBetterAuthOptions['prisma'],
  userId: string,
  lastUsedOrganizationIdValue: unknown,
): Promise<string | undefined> {
  const lastUsedOrganizationId = getString(lastUsedOrganizationIdValue);
  if (lastUsedOrganizationId) {
    const activeOrganization = await prisma.organization.findFirst({
      select: { id: true },
      where: {
        id: lastUsedOrganizationId,
        isDeleted: false,
        members: {
          some: {
            isActive: true,
            isDeleted: false,
            userId,
          },
        },
      },
    });
    if (activeOrganization) {
      return activeOrganization.id;
    }
  }

  const membership = await prisma.member.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
    where: {
      isActive: true,
      isDeleted: false,
      organization: { isDeleted: false },
      userId,
    },
  });

  return getString(membership?.organizationId);
}

export async function resolveBetterAuthJwtAccess(
  prisma: ICreateBetterAuthOptions['prisma'],
  userId: string,
): Promise<{ isSuperAdmin: boolean; organizationId?: string }> {
  const user = await prisma.user.findFirst({
    select: { lastUsedOrganizationId: true, platformRole: true },
    where: { id: userId, isDeleted: false },
  });
  if (!user) {
    return { isSuperAdmin: false };
  }

  const isSuperAdmin = isPlatformSuperAdmin(user?.platformRole);
  const organizationId = await resolveBetterAuthJwtOrganizationIdFromLastUsed(
    prisma,
    userId,
    user?.lastUsedOrganizationId,
  );

  return organizationId ? { isSuperAdmin, organizationId } : { isSuperAdmin };
}

export async function resolveBetterAuthJwtIsSuperAdmin(
  prisma: ICreateBetterAuthOptions['prisma'],
  userId: string,
): Promise<boolean> {
  const user = await prisma.user.findFirst({
    select: { platformRole: true },
    where: { id: userId, isDeleted: false },
  });

  return isPlatformSuperAdmin(user?.platformRole);
}

/**
 * Build the in-process Better Auth instance (epic #735, Phase 1 — #736).
 *
 * Runs against the existing Postgres via the Prisma adapter. Better Auth's `user`
 * model maps onto the existing `User` table (`image` → `avatar`; `handle` filled
 * by a create hook). Plugins: magic-link, organization bridge, jwt, and admin
 * (platform-role-gated impersonation, #2423). The
 * organization plugin is compatibility-only: active org / string-role session
 * state maps onto existing Organization/Member rows while Genfeed remains the
 * tenant authorization source. The desktop-session plugin owns server-only
 * session issuance for the native shell. The jwt plugin issues short-lived
 * JWTs (sub = `User.id`) and publishes a JWKS at
 * `${baseURL}${BETTER_AUTH_BASE_PATH}/jwks`.
 */
export function createBetterAuthInstance(options: ICreateBetterAuthOptions) {
  const {
    prisma,
    apiKey,
    secret,
    baseURL,
    trustedOrigins,
    google,
    github,
    requireEmailVerification = false,
    cookieDomain,
    ipAddressHeaders,
    experimentalJoins,
    rateLimitStore,
    sendMagicLink,
    sendResetPassword,
    sendVerificationEmail,
    onUserCreated,
  } = options;
  const socialProviders = {
    ...(google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
          },
        }
      : {}),
    ...(github
      ? {
          github: {
            clientId: github.clientId,
            clientSecret: github.clientSecret,
          },
        }
      : {}),
  };

  return betterAuth({
    appName: 'Genfeed.ai',
    baseURL,
    basePath: BETTER_AUTH_BASE_PATH,
    secret,
    trustedOrigins,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    account: {
      accountLinking: {
        enabled: true,
        requireLocalEmailVerified: true,
        trustedProviders: ['google', 'github'],
        updateUserInfoOnLink: true,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ token, url, user }) => {
        await sendResetPassword({
          token,
          url,
          user: { email: user.email },
        });
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignIn: requireEmailVerification,
      sendOnSignUp: requireEmailVerification,
      sendVerificationEmail: async ({ token, url, user }) => {
        // Guard: this callback should only be invoked when email verification is
        // required (SMTP is configured). If it fires without that flag, the
        // deployment is misconfigured — throw so the error surfaces rather than
        // silently swallowing a verification that was never sent.
        if (!requireEmailVerification) {
          throw new Error(
            'sendVerificationEmail called but requireEmailVerification is false. ' +
              'Configure SMTP and enable requireEmailVerification before sending verification emails.',
          );
        }
        await sendVerificationEmail({
          token,
          url,
          user: { email: user.email },
        });
      },
    },
    ...(Object.keys(socialProviders).length > 0
      ? {
          socialProviders,
        }
      : {}),
    // Share rate-limit counters across stateless API instances via Redis;
    // `customStorage` scopes Redis to rate limiting only (sessions stay in
    // Postgres). Omitted when no store is wired so the in-memory default holds.
    rateLimit: {
      enabled: true,
      ...(rateLimitStore
        ? { customStorage: buildRateLimitStorage(rateLimitStore) }
        : {}),
    },
    // Experimental single-query joins (Prisma adapter). Env-gated; off unless
    // explicitly enabled after staging verification.
    ...(experimentalJoins ? { experimental: { joins: true } } : {}),
    advanced: buildBetterAuthAdvancedOptions({
      cookieDomain,
      ipAddressHeaders,
    }),
    user: {
      // Better Auth's `image` field maps onto the existing `User.avatar` column.
      fields: { image: 'avatar' },
      // `handle` is a required + unique column that Better Auth does not know
      // about, so it strips the value injected by the `create.before` hook
      // below before the adapter write — every first-time sign-up then fails
      // with `Argument 'handle' is missing`. Declaring it as a known
      // (non-input) field preserves the hook-supplied value through to Prisma.
      additionalFields: {
        handle: {
          input: false,
          required: false,
          type: 'string',
        },
      },
    },
    databaseHooks: buildBetterAuthUserDatabaseHooks(onUserCreated),
    plugins: [
      ...(apiKey ? [buildBetterAuthDashPlugin(apiKey)] : []),
      magicLink(
        buildBetterAuthMagicLinkOptions({
          prisma,
          sendMagicLink,
          storeToken:
            process.env.NODE_ENV === 'development' ? 'plain' : 'hashed',
        }),
      ),
      organization(buildBetterAuthOrganizationOptions(prisma)),
      jwt({
        jwt: {
          issuer: baseURL,
          audience: baseURL,
          // sub defaults to user.id (= genfeed User.id). Embed the active org
          // because DB-less websocket consumers cannot verify membership at
          // connection time.
          definePayload: async ({ user }) => {
            const typed = user as unknown as IBetterAuthJwtUserPayloadSource;
            const userId = getString(typed.id);
            const access: { isSuperAdmin: boolean; organizationId?: string } =
              userId
                ? await resolveBetterAuthJwtAccess(prisma, userId)
                : { isSuperAdmin: false };
            return {
              email: typed.email ?? undefined,
              name: typed.name ?? undefined,
              organizationId: access.organizationId,
              isSuperAdmin: access.isSuperAdmin,
            };
          },
        },
      }),
      admin(buildBetterAuthAdminOptions()),
      desktopSession(),
    ],
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuthInstance>;
