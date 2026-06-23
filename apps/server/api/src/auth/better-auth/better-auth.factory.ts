import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { jwt, magicLink } from 'better-auth/plugins';

import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import type { ICreateBetterAuthOptions } from './better-auth.types';

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
          // sub defaults to user.id (= genfeed User.id). Embed the cheap,
          // stable claims; org/brand are resolved per-request in the strategy.
          definePayload: ({ user }) => {
            const typed = user as unknown as {
              email?: string | null;
              name?: string | null;
              isSuperAdmin?: boolean;
            };
            return {
              email: typed.email ?? undefined,
              name: typed.name ?? undefined,
              isSuperAdmin: typed.isSuperAdmin === true,
            };
          },
        },
      }),
    ],
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuthInstance>;
