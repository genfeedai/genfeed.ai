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
});
