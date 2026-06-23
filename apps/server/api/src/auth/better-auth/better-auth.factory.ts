import { randomUUID } from 'node:crypto';
import type { IBetterAuthJwtUserPayloadSource } from '@genfeedai/interfaces';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { jwt, magicLink } from 'better-auth/plugins';

import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import type { ICreateBetterAuthOptions } from './better-auth.types';

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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
 * Resolve the active organization embedded in BA JWTs for DB-less consumers
 * such as the notifications websocket process. Mirrors
 * BetterAuthIdentityResolverService's org precedence without importing Nest
 * services into the auth factory.
 */
export async function resolveBetterAuthJwtOrganizationId(
  prisma: ICreateBetterAuthOptions['prisma'],
  userId: string,
): Promise<string | undefined> {
  const user = await prisma.user.findUnique({
    select: { lastUsedOrganizationId: true },
    where: { id: userId },
  });

  const lastUsedOrganizationId = getString(user?.lastUsedOrganizationId);
  if (lastUsedOrganizationId) {
    const activeOrganization = await prisma.organization.findFirst({
      select: { id: true },
      where: {
        id: lastUsedOrganizationId,
        isDeleted: false,
        OR: [
          { userId },
          {
            members: {
              some: {
                isActive: true,
                isDeleted: false,
                userId,
              },
            },
          },
        ],
      },
    });
    if (activeOrganization) {
      return activeOrganization.id;
    }
  }

  const ownerOrganization = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
    where: {
      isDeleted: false,
      userId,
    },
  });
  if (ownerOrganization) {
    return ownerOrganization.id;
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

/**
 * Build the in-process Better Auth instance (epic #735, Phase 1 — #736).
 *
 * Runs against the existing Postgres via the Prisma adapter. Better Auth's `user`
 * model maps onto the existing `User` table (`image` → `avatar`; `handle` filled
 * by a create hook). Plugins: magic-link + jwt now; the organization and admin
 * plugins are deferred (they require remapping the custom Organization/Member/Role
 * models). The jwt plugin issues short-lived JWTs (sub = `User.id`) and publishes
 * a JWKS at `${baseURL}${BETTER_AUTH_BASE_PATH}/jwks`.
 */
export function createBetterAuthInstance(options: ICreateBetterAuthOptions) {
  const {
    prisma,
    secret,
    baseURL,
    trustedOrigins,
    google,
    sendMagicLink,
    onUserCreated,
  } = options;

  return betterAuth({
    appName: 'Genfeed.ai',
    baseURL,
    basePath: BETTER_AUTH_BASE_PATH,
    secret,
    trustedOrigins,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      // Email-verification flow lands in Phase 3 (#738); off for dual-run.
      requireEmailVerification: false,
    },
    ...(google
      ? {
          socialProviders: {
            google: {
              clientId: google.clientId,
              clientSecret: google.clientSecret,
            },
          },
        }
      : {}),
    user: {
      // Better Auth's `image` field maps onto the existing `User.avatar` column.
      fields: { image: 'avatar' },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const typed = user as {
              handle?: string;
              email?: string | null;
              name?: string | null;
            };
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
          // so a brand-new user is fully set up before their first request, and
          // (idempotently) a no-op for returning preserved users. Replaces the
          // Clerk `user.created` webhook (epic #735, Phase 4).
          after: async (user) => {
            const typed = user as { id: string; email?: string | null };
            await onUserCreated?.({
              email: typed.email ?? null,
              userId: typed.id,
            });
          },
        },
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url, token }) => {
          await sendMagicLink({ email, url, token });
        },
      }),
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
            const organizationId = userId
              ? await resolveBetterAuthJwtOrganizationId(prisma, userId)
              : undefined;
            return {
              email: typed.email ?? undefined,
              name: typed.name ?? undefined,
              organizationId,
              isSuperAdmin: typed.isSuperAdmin === true,
            };
          },
        },
      }),
    ],
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuthInstance>;
