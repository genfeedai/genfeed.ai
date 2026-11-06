import { Platform } from '@genfeedai/contracts';
import type { AccountPublishingContext } from '@genfeedai/contracts/interfaces';
import { installMockHttp } from '@services/__mocks__/http.mock';
import { CredentialsService } from '@services/organization/credentials.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

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
      const context: AccountPublishingContext = {
        account: {
          id: 'credential-1',
          label: 'Genfeed',
          platform: Platform.TWITTER,
        },
        brand: { id: 'brand-1' },
        constraints: {
          notes: [],
          supportsDirectPublishing: true,
          supportsRichArticleCopy: false,
          supportsThreads: true,
          usesWeightedCharacters: true,
        },
        promptHints: [],
        publishability: 'publishable',
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
        recentPosts: [],
        surface: 'post',
      };
      const controller = new AbortController();
      const get = installMockHttp(service).get.mockResolvedValue({
        data: context,
      });

      await expect(
        service.getPublishingContext('credential-1', 'post', controller.signal),
      ).resolves.toBe(context);
      expect(get).toHaveBeenCalledWith('/credential-1/publishing-context', {
        params: { surface: 'post' },
        signal: controller.signal,
      });
    });
  });

  describe('posting times', () => {
    it('lists posting times for a credential', async () => {
      const get = installMockHttp(service).get.mockResolvedValue({
        data: { times: [{ hour: 9, minute: 0 }] },
      });

      await expect(service.listPostingTimes('credential-1')).resolves.toEqual([
        { hour: 9, minute: 0 },
      ]);
      expect(get).toHaveBeenCalledWith('/credential-1/posting-times', {
        signal: undefined,
      });
    });

    it('requests the next free slot', async () => {
      const get = installMockHttp(service).get.mockResolvedValue({
        data: { found: false },
      });

      await expect(service.findNextSlot('credential-1')).resolves.toEqual({
        found: false,
      });
      expect(get).toHaveBeenCalledWith('/credential-1/next-slot', {
        params: undefined,
        signal: undefined,
      });
    });
  });
});
