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

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(LensesService);
    });
  });

  describe('lens management', () => {
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
