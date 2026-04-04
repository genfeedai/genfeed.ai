import { ServicesService } from '@services/external/services.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('ServicesService', () => {
  let service: ServicesService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    service = new ServicesService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(ServicesService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });
});
