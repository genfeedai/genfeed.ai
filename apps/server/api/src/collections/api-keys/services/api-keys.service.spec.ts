import type { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ApiKeyCategory } from '@genfeedai/enums';

type MockFn = ReturnType<typeof vi.fn>;

type ApiKeysServiceHarness = ApiKeysService & {
  createWithKey: MockFn;
  revoke: MockFn;
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

function createHarness(): ApiKeysServiceHarness {
  const service = Object.create(
    ApiKeysService.prototype,
  ) as ApiKeysServiceHarness;

  service.createWithKey = vi.fn();
  service.revoke = vi.fn();
  Object.defineProperty(service, 'logger', {
    value: { error: vi.fn() },
  });

  return service;
}

describe('ApiKeysService', () => {
  describe('rotateWithKey', () => {
    it('creates a replacement and revokes the original key', async () => {
      const service = createHarness();
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
    });

    it('revokes the replacement key when revoking the original fails', async () => {
      const service = createHarness();
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
    });
  });
});
