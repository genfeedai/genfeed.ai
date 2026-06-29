import { ApiKeyCategory } from '@genfeedai/enums';
import { ApiKeysService } from '@services/management/api-keys.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ApiKeysService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(ApiKeysService);
    });
  });

  describe('api key management', () => {
    it('has inherited read and mutation methods', () => {
      expect(service.findAll).toBeDefined();
      expect(service.findOne).toBeDefined();
      expect(service.patch).toBeDefined();
      expect(service.delete).toBeDefined();
    });

    it('creates Genfeed API keys by default', async () => {
      const postSpy = vi
        .spyOn(service, 'post')
        .mockResolvedValue({ id: 'key-1' } as never);

      await service.createApiKey({
        label: 'MCP',
        scopes: ['videos:read'],
      });

      expect(postSpy).toHaveBeenCalledWith({
        category: ApiKeyCategory.GENFEEDAI,
        label: 'MCP',
        scopes: ['videos:read'],
      });
    });

    it('revokes API keys through delete', async () => {
      const deleteSpy = vi
        .spyOn(service, 'delete')
        .mockResolvedValue({ id: 'key-1' } as never);

      await service.revokeApiKey('key-1');

      expect(deleteSpy).toHaveBeenCalledWith('key-1');
    });
  });
});
