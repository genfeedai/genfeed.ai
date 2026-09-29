import { LensesService } from '@services/elements/lenses.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('LensesService', () => {
  let service: LensesService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LensesService(mockToken);
  });

  describe('lens management', () => {
    it('has delete method', () => {
      expect(service.delete).toBeDefined();
    });
  });
});
