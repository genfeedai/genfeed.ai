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

  it('feeds the shared pager from the admin billing envelope', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [],
        limit: 15,
        page: 2,
        success: true,
        totalDocs: 51,
        totalPages: 4,
      },
    });
    Object.assign(service, { instance: { get } });

    await service.getAdminBilling({ limit: 15, page: 2 });

    expect(get).toHaveBeenCalledWith('admin/billing', {
      params: { limit: 15, page: 2 },
    });
    expect(PagesService.getCurrentPage()).toBe(2);
    expect(PagesService.getTotalPages()).toBe(4);
    expect(PagesService.getTotalDocs()).toBe(51);
  });
});
