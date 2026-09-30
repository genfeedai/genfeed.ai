import { LinksService } from '@services/social/links.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('LinksService', () => {
  let service: LinksService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    service = new LinksService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(LinksService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });
});
