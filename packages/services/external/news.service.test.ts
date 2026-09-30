import { NewsService } from '@services/external/news.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('NewsService', () => {
  let service: NewsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    service = new NewsService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(NewsService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });
});
