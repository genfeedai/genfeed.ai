import { HeyGenService as HeygenService } from '@services/ingredients/heygen.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('HeygenService', () => {
  let service: HeygenService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new HeygenService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(HeygenService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });
});
