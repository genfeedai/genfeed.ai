import { ScenesService } from '@services/elements/scenes.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('ScenesService', () => {
  let service: ScenesService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ScenesService(mockToken);
  });

  describe('scene management', () => {
    it('has delete method', () => {
      expect(service.delete).toBeDefined();
    });
  });
});
