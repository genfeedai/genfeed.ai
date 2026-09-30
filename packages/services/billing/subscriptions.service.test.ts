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
});
