import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BetterAuthInstance } from './better-auth.factory';
import { BetterAuthService } from './better-auth.service';

const makeInstance = (
  verifyJWT: ReturnType<typeof vi.fn>,
): BetterAuthInstance =>
  ({
    api: { verifyJWT },
    handler: () => new Response(null),
  }) as unknown as BetterAuthInstance;

const makeDesktopInstance = (
  createDesktopSession: ReturnType<typeof vi.fn>,
  revokeDesktopSession: ReturnType<typeof vi.fn> = vi.fn(),
): BetterAuthInstance =>
  ({
    api: { createDesktopSession, revokeDesktopSession },
    handler: () => new Response(null),
  }) as unknown as BetterAuthInstance;

describe('BetterAuthService', () => {
  describe('when the instance is null (flag off / unconfigured)', () => {
    let service: BetterAuthService;

    beforeEach(() => {
      service = new BetterAuthService(null);
    });

    it('is not enabled', () => {
      expect(service.isEnabled).toBe(false);
    });

    it('throws when the node handler is requested', () => {
      expect(() => service.nodeHandler).toThrow();
    });

    it('rejects token verification', async () => {
      await expect(service.verifyToken('tok')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('does not create a desktop session cookie', async () => {
      await expect(
        service.createDesktopSessionCookie('user_1'),
      ).resolves.toBeNull();
    });
  });

  describe('desktop session cookie issuance', () => {
    it('returns the exact signed cookie emitted by the plugin endpoint', async () => {
      const headers = new Headers();
      headers.append(
        'set-cookie',
        '__Secure-better-auth.session_token=database-token.signature; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax',
      );
      const createDesktopSession = vi.fn().mockResolvedValue({
        headers,
        response: {
          expiresAt: new Date('2026-08-12T12:00:00.000Z'),
          token: 'database-token',
        },
      });
      const service = new BetterAuthService(
        makeDesktopInstance(createDesktopSession),
      );

      const result = await service.createDesktopSessionCookie('user_1');

      expect(createDesktopSession).toHaveBeenCalledWith({
        body: { userId: 'user_1' },
        returnHeaders: true,
      });
      expect(result).toEqual({
        cookie: {
          cookieName: '__Secure-better-auth.session_token',
          cookieValue: 'database-token.signature',
          expiresAt: expect.any(String),
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
          secure: true,
        },
        token: 'database-token',
      });
    });

    it('uses the plugin revoke endpoint for compensation', async () => {
      const revokeDesktopSession = vi.fn().mockResolvedValue({ status: true });
      const service = new BetterAuthService(
        makeDesktopInstance(vi.fn(), revokeDesktopSession),
      );

      await service.revokeDesktopSession('database-token');

      expect(revokeDesktopSession).toHaveBeenCalledWith({
        body: { token: 'database-token' },
      });
    });
  });

  describe('verifyToken with a constructed instance', () => {
    it('returns the claims for a valid token', async () => {
      const verifyJWT = vi
        .fn()
        .mockResolvedValue({ payload: { aud: 'a', sub: 'user_1' } });
      const service = new BetterAuthService(makeInstance(verifyJWT));

      const claims = await service.verifyToken('tok');

      expect(verifyJWT).toHaveBeenCalledWith({ body: { token: 'tok' } });
      expect(claims.sub).toBe('user_1');
    });

    it('rejects when the payload has no subject', async () => {
      const verifyJWT = vi.fn().mockResolvedValue({ payload: { aud: 'a' } });
      const service = new BetterAuthService(makeInstance(verifyJWT));

      await expect(service.verifyToken('tok')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects when verification throws', async () => {
      const verifyJWT = vi.fn().mockRejectedValue(new Error('bad signature'));
      const service = new BetterAuthService(makeInstance(verifyJWT));

      await expect(service.verifyToken('tok')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('verified-claims memoization', () => {
    const futureExp = () => Math.floor(Date.now() / 1_000) + 3_600;

    it('verifies a repeated token only once while cached', async () => {
      const verifyJWT = vi
        .fn()
        .mockResolvedValue({ payload: { exp: futureExp(), sub: 'user_1' } });
      const service = new BetterAuthService(makeInstance(verifyJWT));

      const first = await service.verifyToken('tok');
      const second = await service.verifyToken('tok');

      expect(first.sub).toBe('user_1');
      expect(second.sub).toBe('user_1');
      expect(verifyJWT).toHaveBeenCalledTimes(1);
    });

    it('verifies distinct tokens independently', async () => {
      const verifyJWT = vi
        .fn()
        .mockResolvedValueOnce({ payload: { exp: futureExp(), sub: 'user_a' } })
        .mockResolvedValueOnce({
          payload: { exp: futureExp(), sub: 'user_b' },
        });
      const service = new BetterAuthService(makeInstance(verifyJWT));

      const a = await service.verifyToken('tok_a');
      const b = await service.verifyToken('tok_b');

      expect(a.sub).toBe('user_a');
      expect(b.sub).toBe('user_b');
      expect(verifyJWT).toHaveBeenCalledTimes(2);
    });

    it('does not cache past the token expiry', async () => {
      const expiredSoon = Math.floor(Date.now() / 1_000); // expires now
      const verifyJWT = vi
        .fn()
        .mockResolvedValue({ payload: { exp: expiredSoon, sub: 'user_1' } });
      const service = new BetterAuthService(makeInstance(verifyJWT));

      await service.verifyToken('tok');
      await service.verifyToken('tok');

      expect(verifyJWT).toHaveBeenCalledTimes(2);
    });

    it('does not cache failed verifications', async () => {
      const verifyJWT = vi
        .fn()
        .mockRejectedValueOnce(new Error('bad signature'))
        .mockResolvedValueOnce({
          payload: { exp: futureExp(), sub: 'user_1' },
        });
      const service = new BetterAuthService(makeInstance(verifyJWT));

      await expect(service.verifyToken('tok')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      const claims = await service.verifyToken('tok');

      expect(claims.sub).toBe('user_1');
      expect(verifyJWT).toHaveBeenCalledTimes(2);
    });
  });
});
