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

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(CameraMovementsService);
    });
  });

  describe('camera movement management', () => {
    it('has findAll method', () => {
      expect(service.findAll).toBeDefined();
    });

    it('has findOne method', () => {
      expect(service.findOne).toBeDefined();
    });

    it('has create method', () => {
      expect(service.post).toBeDefined();
    });

    it('has update method', () => {
      expect(service.patch).toBeDefined();
    });

    it('has delete method', () => {
      expect(service.delete).toBeDefined();
    });
  });
});
