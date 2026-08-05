import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

const createDesktopSessionBodySchema = z.object({
  userId: z.string(),
});

const revokeDesktopSessionBodySchema = z.object({
  token: z.string(),
});

/**
 * Better Auth 1.6.23 compatibility boundary.
 *
 * Session issuance relies on the 1.6.23 internal-adapter APIs
 * `findUserById`/`createSession`; compensation relies on `deleteSession`.
 * Cookie signing and attributes deliberately remain owned by
 * `setSessionCookie`. Re-verify all four calls before upgrading Better Auth.
 */
export function desktopSession() {
  return {
    endpoints: {
      createDesktopSession: createAuthEndpoint(
        '/desktop/session',
        {
          body: createDesktopSessionBodySchema,
          metadata: { SERVER_ONLY: true },
          method: 'POST',
        },
        async (ctx) => {
          const user = await ctx.context.internalAdapter.findUserById(
            ctx.body.userId,
          );
          if (!user) {
            throw APIError.from('NOT_FOUND', {
              code: 'DESKTOP_SESSION_USER_NOT_FOUND',
              message: 'Desktop session user not found',
            });
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          if (!session) {
            throw APIError.from('INTERNAL_SERVER_ERROR', {
              code: 'DESKTOP_SESSION_CREATION_FAILED',
              message: 'Failed to create desktop session',
            });
          }

          await setSessionCookie(ctx, { session, user });

          return ctx.json({
            expiresAt: session.expiresAt,
            token: session.token,
          });
        },
      ),
      revokeDesktopSession: createAuthEndpoint(
        '/desktop/session/revoke',
        {
          body: revokeDesktopSessionBodySchema,
          metadata: { SERVER_ONLY: true },
          method: 'POST',
        },
        async (ctx) => {
          await ctx.context.internalAdapter.deleteSession(ctx.body.token);
          return ctx.json({ status: true });
        },
      ),
    },
    id: 'genfeed-desktop-session',
    version: '1.6.23',
  };
}
