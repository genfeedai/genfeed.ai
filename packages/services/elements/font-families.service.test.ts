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

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(FontFamiliesService);
    });
  });

  describe('font family management', () => {
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
