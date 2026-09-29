import { CameraMovementsService } from '@services/elements/camera-movements.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('CameraMovementsService', () => {
  let service: CameraMovementsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CameraMovementsService(mockToken);
  });

  describe('camera movement management', () => {
    it('has delete method', () => {
      expect(service.delete).toBeDefined();
    });
  });
});
