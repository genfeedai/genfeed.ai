import { ApiKeyCategory } from '@genfeedai/enums';
import { ApiKey } from '@genfeedai/models/auth/api-key.model';
import { ApiKeysService } from '@services/management/api-keys.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

type ApiKeysServiceInternals = ApiKeysService & {
  instance: {
    post: ReturnType<typeof vi.fn>;
  };
  mapOne: ReturnType<typeof vi.fn>;
};

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

    it('keeps Genfeed category fixed when callers provide another category', async () => {
      const postSpy = vi
        .spyOn(service, 'post')
        .mockResolvedValue({ id: 'key-1' } as never);

      await service.createApiKey({
        category: ApiKeyCategory.HEYGEN,
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

    it('rotates API keys through the rotate endpoint and mapOne flow', async () => {
      const serviceWithInternals =
        service as unknown as ApiKeysServiceInternals;
      const responseDocument = {
        data: {
          attributes: {
            key: 'gf_test_rotated',
            label: 'MCP',
          },
          id: 'key-2',
          type: 'api-keys',
        },
      };
      const apiKey = new ApiKey({
        id: 'key-2',
        key: 'gf_test_rotated',
        label: 'MCP',
      });
      const post = vi.fn().mockResolvedValue({ data: responseDocument });
      const mapOne = vi.fn().mockResolvedValue(apiKey);

      Object.defineProperty(serviceWithInternals, 'instance', {
        value: { post },
      });
      Object.defineProperty(serviceWithInternals, 'mapOne', {
        value: mapOne,
      });

      await expect(service.rotateApiKey('key-1')).resolves.toBe(apiKey);

      expect(post).toHaveBeenCalledWith('/key-1/rotate');
      expect(mapOne).toHaveBeenCalledWith(responseDocument);
    });
  });
});
