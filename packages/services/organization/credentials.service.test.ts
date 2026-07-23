import type { AccountPublishingContext } from '@genfeedai/interfaces';
import { CredentialsService } from '@services/organization/credentials.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

type TestableCredentialsService = CredentialsService & {
  instance: {
    get: ReturnType<typeof vi.fn>;
  };
};

describe('CredentialsService', () => {
  let service: CredentialsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CredentialsService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(CredentialsService);
    });
  });

  describe('credential management', () => {
    it('has findAll method for fetching all credentials', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method for fetching single credential', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });

    it('has post method for creating credentials', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has patch method for updating credentials', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has delete method for removing credentials', () => {
      expect(service.delete).toBeDefined();
      expect(typeof service.delete).toBe('function');
    });
  });

  describe('publishing readiness', () => {
    it('loads the account publishing context with surface and cancellation', async () => {
      const context = {
        account: {
          id: 'credential-1',
          label: 'Genfeed',
          platform: 'twitter',
        },
        readiness: {
          appReviewStatus: 'pass',
          callbackUrlStatus: 'pass',
          canSchedule: true,
          diagnostics: [],
          isRetryable: false,
          permissionScopeStatus: 'pass',
          providerKey: 'twitter',
          quotaStatus: 'pass',
          state: 'publish_capable',
          tokenFreshness: 'pass',
        },
        surface: 'post',
      } as AccountPublishingContext;
      const controller = new AbortController();
      const get = vi.fn().mockResolvedValue({ data: context });
      (service as unknown as TestableCredentialsService).instance = { get };

      await expect(
        service.getPublishingContext('credential-1', 'post', controller.signal),
      ).resolves.toBe(context);
      expect(get).toHaveBeenCalledWith('/credential-1/publishing-context', {
        params: { surface: 'post' },
        signal: controller.signal,
      });
    });
  });
});
