import type { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ApiKeyCategory } from '@genfeedai/enums';

type MockFn = ReturnType<typeof vi.fn>;

type ApiKeysServiceHarness = ApiKeysService & {
  createWithKey: MockFn;
  revoke: MockFn;
};

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
});
