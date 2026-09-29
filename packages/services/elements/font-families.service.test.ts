import { FontFamiliesService } from '@services/elements/font-families.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('FontFamiliesService', () => {
  let service: FontFamiliesService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FontFamiliesService(mockToken);
  });

  describe('font family management', () => {
    it('has delete method', () => {
      expect(service.delete).toBeDefined();
    });
  });
});
