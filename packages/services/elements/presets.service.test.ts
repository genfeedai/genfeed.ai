import { PresetsService } from '@services/elements/presets.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('PresetsService', () => {
  let service: PresetsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PresetsService(mockToken);
  });

  describe('preset management', () => {
    it('has delete method', () => {
      expect(service.delete).toBeDefined();
    });
  });
});
