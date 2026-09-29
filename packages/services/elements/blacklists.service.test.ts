import { BlacklistsService } from '@services/elements/blacklists.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('BlacklistsService', () => {
  let service: BlacklistsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BlacklistsService(mockToken);
  });

  describe('blacklist management', () => {
    it('has delete method', () => {
      expect(service.delete).toBeDefined();
    });
  });
});
