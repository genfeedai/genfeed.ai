import { MusicsService } from '@services/ingredients/musics.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('MusicsService', () => {
  let service: MusicsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MusicsService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(MusicsService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });
});
