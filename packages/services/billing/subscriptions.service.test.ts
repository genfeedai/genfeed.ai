import { SubscriptionsService } from '@services/billing/subscriptions.service';
import { PagesService } from '@services/content/pages.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    service = new SubscriptionsService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(SubscriptionsService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });

  describe('getCreditUsage', () => {
    const response = {
      data: [],
      limit: 15,
      page: 2,
      success: true,
      totalDocs: 31,
      totalPages: 3,
    };

    function stubInstance() {
      const get = vi.fn().mockResolvedValue({ data: response });
      Object.defineProperty(service, 'instance', { value: { get } });
      return get;
    }

    it('forwards the page window and records the totals for AutoPagination', async () => {
      const get = stubInstance();
      const signal = new AbortController().signal;

      await expect(
        service.getCreditUsage({ limit: 15, page: 2 }, signal),
      ).resolves.toBe(response);

      expect(get).toHaveBeenCalledWith('admin/credit-usage', {
        params: { limit: 15, page: 2 },
        signal,
      });
      expect(PagesService.getCurrentPage()).toBe(2);
      expect(PagesService.getTotalPages()).toBe(3);
      expect(PagesService.getTotalDocs()).toBe(31);
    });

    it('leaves the shared totals alone when no page was requested', async () => {
      PagesService.setTotalDocs(7);
      stubInstance();

      await service.getCreditUsage();

      expect(PagesService.getTotalDocs()).toBe(7);
    });
  });
});
