import { SoundsService } from '@services/elements/sounds.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('SoundsService', () => {
  let service: SoundsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SoundsService(mockToken);
  });

  describe('sound management', () => {
    it('has delete method', () => {
      expect(service.delete).toBeDefined();
    });
  });
});
