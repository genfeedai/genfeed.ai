import { createHmac } from 'node:crypto';
import type { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import {
  ActionOrigin,
  API_KEY_ACTION_ORIGIN_METADATA_KEY,
  API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY,
  ApiKeyCategory,
} from '@genfeedai/enums';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

type MockFn = ReturnType<typeof vi.fn>;

type ApiKeysServiceHarness = ApiKeysService & {
  createWithKey: MockFn;
  revoke: MockFn;
};

type ApiKeysValidationHarness = ApiKeysService & {
  create: MockFn;
};

/**
 * Harness that leaves createWithKey/assertValidScopes REAL (only stubs the
 * downstream BaseService.create + key-gen helpers) so scope validation is
 * exercised end-to-end.
 */
function createValidationHarness(): ApiKeysValidationHarness {
  const service = Object.create(
    ApiKeysService.prototype,
  ) as ApiKeysValidationHarness;
  service.create = vi
    .fn()
    .mockResolvedValue({ id: 'key-new' } as ApiKeyDocument);
  service.generateApiKey = vi.fn().mockReturnValue('gf_test_plain');
  service.hashApiKey = vi.fn().mockResolvedValue('hashed');
  service.computeFingerprint = vi.fn().mockReturnValue('fingerprint');
  Object.defineProperty(service, 'logger', { value: { error: vi.fn() } });
  Object.defineProperty(service, 'configService', {
    configurable: true,
    value: {
      get: vi.fn((key: string) =>
        key === 'GENFEEDAI_API_KEY' ? 'test-signing-secret' : undefined,
      ),
    },
  });
  return service;
}

type MockCacheInvalidationService = {
  invalidate: MockFn;
  invalidateByTags: MockFn;
};

const rotatePayload: CreateApiKeyDto & {
  organizationId: string;
  userId: string;
} = {
  category: ApiKeyCategory.GENFEEDAI,
  label: 'MCP',
  organizationId: 'org-1',
  scopes: ['videos:read'],
  userId: 'user-1',
};

function createHarness(): {
  cacheInvalidationService: MockCacheInvalidationService;
  service: ApiKeysServiceHarness;
} {
  const service = Object.create(
    ApiKeysService.prototype,
  ) as ApiKeysServiceHarness;
  const cacheInvalidationService = {
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateByTags: vi.fn().mockResolvedValue(0),
  };

  service.createWithKey = vi.fn();
  service.revoke = vi.fn();
  Object.defineProperty(service, 'cacheInvalidationService', {
    value: cacheInvalidationService,
  });
  Object.defineProperty(service, 'logger', {
    value: { error: vi.fn() },
  });

  return { cacheInvalidationService, service };
}

describe('ApiKeysService', () => {
  describe('resolveActionOrigin', () => {
    const { service } = createHarness();
    Object.defineProperty(service, 'configService', {
      value: {
        get: vi.fn((key: string) =>
          key === 'GENFEEDAI_API_KEY' ? 'test-signing-secret' : undefined,
        ),
      },
    });

    it('accepts only signed server-issued CLI/UI labels and defaults to API', () => {
      const proof = createHmac('sha256', 'test-signing-secret')
        .update('cli:user-1:org-1:fingerprint')
        .digest('base64url');
      expect(
        service.resolveActionOrigin({
          metadata: {
            [API_KEY_ACTION_ORIGIN_METADATA_KEY]: ActionOrigin.CLI,
            [API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY]: proof,
          },
          keyFingerprint: 'fingerprint',
          organizationId: 'org-1',
          userId: 'user-1',
        } as ApiKeyDocument),
      ).toBe(ActionOrigin.CLI);
      expect(
        service.resolveActionOrigin({
          metadata: {
            [API_KEY_ACTION_ORIGIN_METADATA_KEY]: ActionOrigin.CLI,
          },
        } as ApiKeyDocument),
      ).toBe(ActionOrigin.API);
      expect(service.resolveActionOrigin({} as ApiKeyDocument)).toBe(
        ActionOrigin.API,
      );
    });
  });

  describe('rotateWithKey', () => {
    it('creates a replacement and revokes the original key', async () => {
      const { cacheInvalidationService, service } = createHarness();
      const replacement = {
        apiKey: { id: 'key-2' } as ApiKeyDocument,
        plainKey: 'gf_test_rotated',
      };

      service.createWithKey.mockResolvedValue(replacement);
      service.revoke.mockResolvedValue({ id: 'key-1' } as ApiKeyDocument);

      await expect(service.rotateWithKey('key-1', rotatePayload)).resolves.toBe(
        replacement,
      );

      expect(service.createWithKey).toHaveBeenCalledWith(rotatePayload);
      expect(service.revoke).toHaveBeenCalledWith('key-1');
      expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
        'apiKeys:list:org-1',
        'apiKeys:single:key-1',
        'apiKeys:single:key-2',
      );
      expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
        'apiKeys',
      ]);
    });

    it('revokes the replacement key when revoking the original fails', async () => {
      const { cacheInvalidationService, service } = createHarness();
      const error = new Error('revoke failed');
      const replacement = {
        apiKey: { id: 'key-2' } as ApiKeyDocument,
        plainKey: 'gf_test_rotated',
      };

      service.createWithKey.mockResolvedValue(replacement);
      service.revoke
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ id: 'key-2' } as ApiKeyDocument);

      await expect(
        service.rotateWithKey('key-1', rotatePayload),
      ).rejects.toThrow(error);

      expect(service.revoke).toHaveBeenNthCalledWith(1, 'key-1');
      expect(service.revoke).toHaveBeenNthCalledWith(2, 'key-2');
      expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
      expect(cacheInvalidationService.invalidateByTags).not.toHaveBeenCalled();
    });
  });

  describe('assertValidScopes', () => {
    const { service } = createHarness();

    it('rejects the wildcard scope', () => {
      expect(() => service.assertValidScopes(['*'])).toThrow(
        BadRequestException,
      );
    });

    it('rejects unknown scopes', () => {
      expect(() => service.assertValidScopes(['not-a-real-scope'])).toThrow(
        BadRequestException,
      );
      expect(() =>
        service.assertValidScopes(['videos:read', 'bogus:scope']),
      ).toThrow(/bogus:scope/);
    });

    it('accepts defined self-service scopes', () => {
      expect(() =>
        service.assertValidScopes(['videos:read', 'images:create']),
      ).not.toThrow();
    });

    it('accepts privileged managed scopes defined in the enum', () => {
      expect(() =>
        service.assertValidScopes([
          'credits:provision',
          'managed-inference:execute',
        ]),
      ).not.toThrow();
    });
  });

  describe('createWithKey scope validation', () => {
    it('rejects a wildcard scope before persisting', async () => {
      const service = createValidationHarness();

      await expect(
        service.createWithKey({
          category: ApiKeyCategory.GENFEEDAI,
          label: 'k',
          organizationId: 'org-1',
          scopes: ['*'],
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown scope before persisting', async () => {
      const service = createValidationHarness();

      await expect(
        service.createWithKey({
          category: ApiKeyCategory.GENFEEDAI,
          label: 'k',
          organizationId: 'org-1',
          scopes: ['videos:read', 'made-up:scope'],
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('persists when every scope is valid', async () => {
      const service = createValidationHarness();

      await service.createWithKey({
        category: ApiKeyCategory.GENFEEDAI,
        label: 'k',
        organizationId: 'org-1',
        scopes: ['videos:read', 'images:create'],
        userId: 'user-1',
      });

      expect(service.create).toHaveBeenCalledTimes(1);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: ['videos:read', 'images:create'] }),
      );
    });

    it('signs action origin only when requested by a trusted issuance path', async () => {
      const service = createValidationHarness();

      await service.createWithKey(
        {
          category: ApiKeyCategory.GENFEEDAI,
          label: 'CLI',
          metadata: {
            [API_KEY_ACTION_ORIGIN_METADATA_KEY]: ActionOrigin.MCP,
            kind: 'cli-session',
          },
          organizationId: 'org-1',
          scopes: ['videos:read'],
          userId: 'user-1',
        },
        ActionOrigin.CLI,
      );

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            [API_KEY_ACTION_ORIGIN_METADATA_KEY]: ActionOrigin.CLI,
            [API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY]: createHmac(
              'sha256',
              'test-signing-secret',
            )
              .update('cli:user-1:org-1:fingerprint')
              .digest('base64url'),
            kind: 'cli-session',
          },
        }),
      );
    });

    it('rejects trusted issuance when action-origin signing is unavailable', async () => {
      const service = createValidationHarness();
      Object.defineProperty(service, 'configService', {
        value: { get: vi.fn() },
      });

      await expect(
        service.createWithKey(
          {
            category: ApiKeyCategory.GENFEEDAI,
            label: 'CLI',
            organizationId: 'org-1',
            scopes: ['videos:read'],
            userId: 'user-1',
          },
          ActionOrigin.CLI,
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('hasScope', () => {
    const { service } = createHarness();

    it('matches an explicitly granted scope', () => {
      expect(
        service.hasScope(
          { scopes: ['videos:read'] } as ApiKeyDocument,
          'videos:read',
        ),
      ).toBe(true);
    });

    it('does not match a scope the key was not granted', () => {
      expect(
        service.hasScope(
          { scopes: ['videos:read'] } as ApiKeyDocument,
          'images:read',
        ),
      ).toBe(false);
    });

    it('does NOT honor a wildcard scope', () => {
      expect(
        service.hasScope({ scopes: ['*'] } as ApiKeyDocument, 'videos:read'),
      ).toBe(false);
    });
  });
});
