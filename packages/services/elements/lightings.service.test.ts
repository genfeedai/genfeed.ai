import { LightingsService } from '@services/elements/lightings.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('LightingsService', () => {
  let service: LightingsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LightingsService(mockToken);
  });

  describe('lighting management', () => {
    it('has delete method', () => {
      expect(service.delete).toBeDefined();
    });
  });
});
