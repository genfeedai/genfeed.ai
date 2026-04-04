import { AvatarsService } from '@services/ingredients/avatars.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('AvatarsService', () => {
  let service: AvatarsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AvatarsService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(AvatarsService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });
});
