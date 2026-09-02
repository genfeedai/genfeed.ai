import { PostingCadencesController } from '@api/collections/posting-cadences/controllers/posting-cadences.controller';
import { PostingSetsController } from '@api/collections/posting-sets/controllers/posting-sets.controller';
import { PostingSignaturesController } from '@api/collections/posting-sets/controllers/posting-signatures.controller';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const protectedHandlers = [
  PostingCadencesController.prototype.skip,
  PostingCadencesController.prototype.cancel,
  PostingCadencesController.prototype.generateBulk,
  PostingCadencesController.prototype.update,
  PostingCadencesController.prototype.remove,
  PostingSetsController.prototype.create,
  PostingSetsController.prototype.update,
  PostingSetsController.prototype.remove,
  PostingSetsController.prototype.expand,
  PostingSignaturesController.prototype.create,
  PostingSignaturesController.prototype.update,
  PostingSignaturesController.prototype.remove,
];

describe('posting write authorization', () => {
  const apiKey = {
    id: 'api-key-1',
    organizationId: 'org-1',
    scopes: [ApiKeyScope.ANALYTICS_READ] as ApiKeyScope[],
    userId: 'user-1',
  };
  const apiKeysService = {
    checkRateLimit: vi.fn().mockResolvedValue({
      allowed: true,
      limit: 60,
      retryAfterSeconds: 0,
    }),
    findByKey: vi.fn().mockResolvedValue(apiKey),
    hasScope: vi.fn((_key: typeof apiKey, scope: ApiKeyScope) =>
      apiKey.scopes.includes(scope),
    ),
    hasTrustedMcpOriginProof: vi.fn().mockReturnValue(true),
    isIpAllowed: vi.fn().mockReturnValue(true),
    isMcpOAuthSession: vi.fn().mockReturnValue(false),
    resolveActionOrigin: vi.fn(),
    updateLastUsed: vi.fn(),
  };
  const guard = new ApiKeyAuthGuard(apiKeysService as never, new Reflector());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(protectedHandlers)(
    'rejects an unrelated-scope API key before %s can mutate',
    async (handler) => {
      const invokeMutation = vi.fn();
      const request = {
        connection: { remoteAddress: '127.0.0.1' },
        headers: { authorization: 'Bearer gf_unrelated_scope' },
        ip: '127.0.0.1',
      };
      const context = {
        getClass: () => handler,
        getHandler: () => handler,
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => ({ setHeader: vi.fn() }),
        }),
      } as unknown as ExecutionContext;

      const dispatch = async () => {
        if (await guard.canActivate(context)) {
          invokeMutation();
        }
      };

      await expect(dispatch()).rejects.toThrow('Insufficient permissions');
      expect(invokeMutation).not.toHaveBeenCalled();
      expect(apiKeysService.updateLastUsed).not.toHaveBeenCalled();
    },
  );
});
