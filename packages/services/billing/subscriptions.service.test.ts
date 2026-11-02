import { SubscriptionsService } from '@services/billing/subscriptions.service';
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

  it('returns the admin billing totals with its rows', async () => {
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

    const response = await service.getAdminBilling({ limit: 15, page: 2 });

    expect(get).toHaveBeenCalledWith('admin/billing', {
      params: { limit: 15, page: 2 },
    });
    expect(response).toMatchObject({ page: 2, totalPages: 4, totalDocs: 51 });
  });
});
