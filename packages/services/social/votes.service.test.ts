import { VotesService } from '@services/social/votes.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('VotesService', () => {
  let service: VotesService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    service = new VotesService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(VotesService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });
});
